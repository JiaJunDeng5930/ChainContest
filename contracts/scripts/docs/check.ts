import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Handlebars from "handlebars";
import hre from "hardhat";
import { defaults as docgenDefaults } from "solidity-docgen/dist/config";
import { render } from "solidity-docgen/dist/render";
import { buildSite } from "solidity-docgen/dist/site";
import { loadTemplates } from "solidity-docgen/dist/templates";
import type { RenderedPage } from "solidity-docgen/dist/render";
import {
  createDocgenConfig,
  resolveGenerationMetadata,
  HARDHAT_ROOT,
  IndexTemplateInput,
} from "../../docgen/config";
import {
  loadBuilds,
  stripExistingHeader,
  buildContractIndex,
  DocgenSite,
} from "./shared";

const execFileAsync = promisify(execFile);

function normalizeBody(body: string): string {
  return body
    .replace(/^- \*\*提交哈希\*\*：.*$/gm, '- **提交哈希**：<commit>')
    .replace(/^- \*\*生成时间 \(UTC\)\*\*：.*$/gm, '- **生成时间 (UTC)**：<generated-at>')
    .trimEnd();
}

async function ensureNatSpecCoverage(): Promise<void> {
  await hre.run("compile");
  await hre.run("validateOutput");
}

async function renderDocs(): Promise<{
  rendered: RenderedPage[];
  site: DocgenSite;
}> {
  const docgenConfig = createDocgenConfig();
  const config = {
    ...docgenDefaults,
    ...docgenConfig,
    root: HARDHAT_ROOT,
    sourcesDir: "src",
  };

  const buildInfoPaths = await hre.artifacts.getBuildInfoPaths();
  if (buildInfoPaths.length === 0) {
    throw new Error("未找到 Hardhat build 信息，请先运行 compile");
  }

  const builds = await loadBuilds(buildInfoPaths);
  const templates = await loadTemplates(config.theme, config.root!, config.templates);
  const site = buildSite(builds, config, templates.properties ?? {});
  const rendered = render(site, templates, config.collapseNewlines);
  rendered.sort((a, b) => a.id.localeCompare(b.id));
  return { rendered, site };
}

async function assertDocsUpToDate(rendered: RenderedPage[], site: DocgenSite): Promise<void> {
  const metadata = resolveGenerationMetadata();
  const docOutputDir = createDocgenConfig().outputDir;
  if (!docOutputDir) {
    throw new Error("未配置文档输出目录，请检查 docgen 配置");
  }
  const generatedBodies = new Map<string, string>();

  for (const page of rendered) {
    generatedBodies.set(page.id, normalizeBody(stripExistingHeader(page.contents)));
  }

  const templatePath = path.resolve(HARDHAT_ROOT, "docgen/index.hbs");
  const templateSource = await fs.readFile(templatePath, "utf8");
  const template = Handlebars.compile(templateSource);
  const indexInput: IndexTemplateInput = {
    metadata,
    contracts: buildContractIndex(site) as IndexTemplateInput["contracts"],
  };
  const indexBody = normalizeBody(stripExistingHeader(template(indexInput)));
  generatedBodies.set("index.md", indexBody);

  for (const [relativePath, expectedBody] of generatedBodies) {
    const diskPath = path.resolve(HARDHAT_ROOT, docOutputDir, relativePath);
    let existing: string;
    try {
      existing = await fs.readFile(diskPath, "utf8");
    } catch (error) {
      throw new Error(`缺少文档文件 ${relativePath}，请先运行 docs:generate`);
    }
    const existingBody = normalizeBody(stripExistingHeader(existing));
    if (existingBody !== expectedBody) {
      throw new Error(`文档 ${relativePath} 与源码不一致，请运行 docs:generate 并提交更新`);
    }
  }
}

async function assertGitClean(): Promise<void> {
  const { stdout } = await execFileAsync("git", [
    "status",
    "--porcelain",
    "--",
    "docs/contracts",
  ], {
    cwd: HARDHAT_ROOT,
  });
  if (stdout.trim().length > 0) {
    throw new Error("检测到 docs/contracts 下存在未提交的变更，请执行 docs:generate 并提交或还原后再运行 docs:check");
  }
}

async function main() {
  try {
    await ensureNatSpecCoverage();
    const { rendered, site } = await renderDocs();
    await assertDocsUpToDate(rendered, site);
    await assertGitClean();
    process.stdout.write("✅ NatSpec 检查通过，文档与源码保持同步，工作区干净\n");
  } catch (error) {
    console.error("❌ 文档检查失败", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

main();

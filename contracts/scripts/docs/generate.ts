import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import Handlebars from "handlebars";
import hre from "hardhat";
import type { BuildInfo } from "hardhat/types";
import { defaults as docgenDefaults } from "solidity-docgen/dist/config";
import { render } from "solidity-docgen/dist/render";
import { buildSite } from "solidity-docgen/dist/site";
import { loadTemplates } from "solidity-docgen/dist/templates";
import type { RenderedPage } from "solidity-docgen/dist/render";
import {
  createDocgenConfig,
  resolveGenerationMetadata,
  GenerationMetadata,
  HARDHAT_ROOT,
  ContractIndex,
  IndexTemplateInput,
} from "../../docgen/config";
import {
  loadBuilds,
  stripExistingHeader,
  withHeader,
  buildContractIndex,
  writeRenderedPage,
  DocgenSite,
} from "./shared";

interface CliArgs {
  outputDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current) continue;
    if (current === "--output" || current === "--outputDir") {
      args.outputDir = argv[i + 1];
      i += 1;
    }
  }
  return args;
}


async function writeIndex(
  site: DocgenSite,
  metadata: GenerationMetadata,
  rootDir: string,
  outputDir: string,
) {
  const templatePath = path.resolve(rootDir, "docgen/index.hbs");
  const templateSource = await fs.readFile(templatePath, "utf8");
  const template = Handlebars.compile(templateSource);
  const contracts = buildContractIndex(site);
  const indexInput: IndexTemplateInput = {
    metadata,
    contracts: contracts as ContractIndex[] & { length: number },
  };
  const renderedIndex = template(indexInput);
  const outputFile = path.resolve(rootDir, outputDir, "index.md");
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const contentWithHeader = withHeader(renderedIndex, metadata);
  await fs.writeFile(outputFile, contentWithHeader, "utf8");
}

async function writePages(
  renderedPages: RenderedPage[],
  rootDir: string,
  outputDir: string,
  metadata: GenerationMetadata,
) {
  for (const page of renderedPages) {
    const outputFile = path.resolve(rootDir, outputDir, page.id);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    const content = withHeader(page.contents, metadata);
    await fs.writeFile(outputFile, content, "utf8");
  }
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const docgenConfig = createDocgenConfig({ outputDir: cliArgs.outputDir });
  const config = {
    ...docgenDefaults,
    ...docgenConfig,
    root: HARDHAT_ROOT,
    sourcesDir: "src",
  };

  await hre.run("compile");
  const buildInfoPaths = await hre.artifacts.getBuildInfoPaths();
  if (buildInfoPaths.length === 0) {
    throw new Error("未找到 Hardhat build 信息，请先运行 compile");
  }

  const builds = await loadBuilds(buildInfoPaths);
  const templates = await loadTemplates(config.theme, config.root!, config.templates);
  const site = buildSite(builds, config, templates.properties ?? {});
  const rendered = render(site, templates, config.collapseNewlines);
  rendered.sort((a, b) => a.id.localeCompare(b.id));

  const metadata = resolveGenerationMetadata();
  await writeRenderedPage(rendered, config.root!, config.outputDir, metadata);
  await writeIndex(site, metadata, config.root!, config.outputDir);

  process.stdout.write(
    `✅ 生成 ${rendered.length} 个 Markdown 文档，输出目录：${path.resolve(
      config.root!,
      config.outputDir,
    )}\nℹ️ NatSpec 写作规范：docs/contracts/NatSpec写作规范.md\n`,
  );
}

main().catch(error => {
  console.error("❌ 文档生成失败", error);
  process.exitCode = 1;
});

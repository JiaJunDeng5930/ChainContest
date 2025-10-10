import { promises as fs } from "node:fs";
import path from "node:path";
import type { BuildInfo } from "hardhat/types";
import { DOC_ITEM_CONTEXT } from "solidity-docgen/dist/site";
import type { ContractIndex, ContractIndexEntry } from "../../docgen/config";

export type DocItem = any;
export interface DocgenPage {
  id: string;
  items: DocItem[];
}
export interface DocgenSite {
  pages: DocgenPage[];
}

const NON_ALPHANUMERIC = /[^a-z0-9]+/gi;
const DASH_DUPLICATES = /-+/g;
const TRIM_DASH = /^-+|-+$/g;

function slugify(input: string): string {
  return input
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "-")
    .replace(DASH_DUPLICATES, "-")
    .replace(TRIM_DASH, "");
}

export function stripExistingHeader(content: string): string {
  if (!content.startsWith(">")) return content.trimStart();
  const lines = content.split(/\r?\n/);
  let index = 0;
  while (index < lines.length && lines[index].startsWith(">")) {
    index += 1;
  }
  if (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }
  return lines.slice(index).join("\n").trimStart();
}

export interface GenerationMetadataLike {
  commitHash: string;
  generatedAt: string;
}

export function withHeader(body: string, metadata: GenerationMetadataLike): string {
  const header = [
    "> ⚙️**自动生成文档**",
    `> - 提交哈希：${metadata.commitHash}`,
    `> - 生成时间 (UTC)：${metadata.generatedAt}`,
    `> - 命令：pnpm --filter contracts docs:generate`,
    "",
  ].join("\n");

  const rest = stripExistingHeader(body);
  return `${header}${rest.length ? `\n\n${rest}` : ""}`.trimEnd() + "\n";
}

interface BuildFile {
  path: string;
  mtimeMs: number;
  data: BuildInfo;
}

export async function loadBuilds(paths: string[]): Promise<BuildInfo[]> {
  const buildFiles: BuildFile[] = await Promise.all(
    paths.map(async buildPath => {
      const [stat, raw] = await Promise.all([
        fs.stat(buildPath),
        fs.readFile(buildPath, "utf8"),
      ]);
      return {
        path: buildPath,
        mtimeMs: stat.mtimeMs,
        data: JSON.parse(raw) as BuildInfo,
      };
    }),
  );

  buildFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return buildFiles.map(file => file.data);
}

function coerceSummary(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(value)) {
    const joined = value.join(" ").replace(/\s+/g, " ").trim();
    return joined.length > 0 ? joined : undefined;
  }
  if (typeof value === "object" && value !== null && "text" in value) {
    return coerceSummary((value as { text?: unknown }).text);
  }
  return undefined;
}

function labelForContractKind(kind: string | undefined): string {
  switch (kind) {
    case "interface":
      return "接口";
    case "library":
      return "库";
    case "abstract":
      return "抽象合约";
    default:
      return "合约";
  }
}

function ensureAnchor(contractName: string, item: DocItem, fallbackKind: string): string | undefined {
  if (typeof item.anchor === "string" && item.anchor.length > 0) {
    return item.anchor;
  }
  const base = slugify(contractName);
  const name = typeof item.name === "string" && item.name.length > 0 ? item.name : item.kind ?? "";
  if (!name) return undefined;
  const slug = [base, fallbackKind, slugify(name)].filter(Boolean).join("-");
  return slug || undefined;
}

function buildEntry(
  contractName: string,
  docPath: string,
  kind: "function" | "event" | "error",
  item: DocItem,
): ContractIndexEntry {
  const title = typeof item.name === "string" && item.name.length > 0 ? item.name : item.kind ?? "";
  const summary = coerceSummary((item.natspec as Record<string, unknown>)?.notice);
  return {
    name: title,
    title,
    docPath,
    anchor: ensureAnchor(contractName, item, kind),
    summary,
    kind,
  };
}

function isPublicFunction(item: DocItem): boolean {
  const visibility = typeof item.visibility === "string" ? item.visibility : "";
  return visibility === "public" || visibility === "external";
}

export function buildContractIndex(site: DocgenSite): ContractIndex[] {
  const contracts: ContractIndex[] = [];
  for (const page of site.pages) {
    const docPath = page.id.replace(/\\/g, "/");
    for (const item of page.items) {
      if (item.nodeType !== "ContractDefinition") continue;
      const name = typeof item.name === "string" && item.name.length > 0 ? item.name : "Unnamed";
      const contractKind = (item.contractKind as ContractIndex["contractKind"]) ?? "contract";
      const functions = (Array.isArray(item.functions) ? item.functions : [])
        .filter((fn: DocItem) => isPublicFunction(fn))
        .map((fn: DocItem) => buildEntry(name, docPath, "function", fn));
      const events = (Array.isArray(item.events) ? item.events : [])
        .map((ev: DocItem) => buildEntry(name, docPath, "event", ev));
      const errors = (Array.isArray(item.errors) ? item.errors : [])
        .map((err: DocItem) => buildEntry(name, docPath, "error", err));
      const summary = coerceSummary((item.natspec as Record<string, unknown>)?.notice);
      contracts.push({
        name,
        contractKind,
        kindLabel: labelForContractKind(contractKind),
        summary,
        docPath,
        functions,
        events,
        errors,
      });
    }
  }
  contracts.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return contracts;
}

export async function writeRenderedPage(
  renderedPages: { id: string; contents: string }[],
  rootDir: string,
  outputDir: string,
  metadata: GenerationMetadataLike,
) {
  for (const page of renderedPages) {
    const outputFile = path.resolve(rootDir, outputDir, page.id);
    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    const content = withHeader(page.contents, metadata);
    await fs.writeFile(outputFile, content, "utf8");
  }
}

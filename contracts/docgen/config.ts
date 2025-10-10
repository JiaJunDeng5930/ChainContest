import { execSync } from "node:child_process";
import path from "node:path";
import type { UserConfig } from "solidity-docgen/dist/config";

export interface GenerateOptions {
  /**
   * Override root directory used for resolving relative docgen paths.
   */
  rootDir?: string;
  /**
   * Custom output directory relative to the Hardhat project root.
   */
  outputDir?: string;
  /**
   * Additional directories under `contracts/src` to exclude.
   */
  exclude?: string[];
}

export const HARDHAT_ROOT = path.resolve(__dirname, "../");
const DEFAULT_OUTPUT_RELATIVE = "../docs/contracts";
const DEFAULT_TEMPLATES_RELATIVE = "docgen/templates/partials";

export const DOCS_OUTPUT_ABSOLUTE = path.resolve(
  HARDHAT_ROOT,
  DEFAULT_OUTPUT_RELATIVE,
);

export function createDocgenConfig(options: GenerateOptions = {}): UserConfig {
  const rootDir = options.rootDir ?? HARDHAT_ROOT;
  const outputRelative = options.outputDir ?? DEFAULT_OUTPUT_RELATIVE;

  // Ensure deterministic ordering by relying on `pages: 'files'` and explicit
  // exclusions for folders that should not surface in the docs.
  return {
    outputDir: path.resolve(rootDir, outputRelative),
    templates: DEFAULT_TEMPLATES_RELATIVE,
    pages: "files",
    collapseNewlines: true,
    exclude: ["mocks", "test", ...(options.exclude ?? [])],
    pageExtension: ".md",
  };
}

export interface GenerationMetadata {
  commitHash: string;
  generatedAt: string;
}

export interface ContractIndexEntry {
  name: string;
  title: string;
  docPath: string;
  anchor?: string;
  summary?: string;
  kind: "function" | "event" | "error";
}

export interface ContractIndex {
  name: string;
  contractKind: "contract" | "interface" | "library" | "abstract";
  kindLabel: string;
  summary?: string;
  docPath: string;
  functions: ContractIndexEntry[];
  events: ContractIndexEntry[];
  errors: ContractIndexEntry[];
}

export interface IndexTemplateInput {
  metadata: GenerationMetadata;
  contracts: ContractIndex[] & { length: number };
}

export function resolveGenerationMetadata(): GenerationMetadata {
  const commitHash = execSync("git rev-parse HEAD", { cwd: HARDHAT_ROOT })
    .toString()
    .trim();
  const generatedAt = new Date().toISOString();
  return { commitHash, generatedAt };
}

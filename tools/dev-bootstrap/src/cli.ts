import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ExitCode } from "./orchestration/errors.js";
import { runValidateCommand } from "./commands/validate.js";
import { runStartCommand } from "./commands/start.js";
import { runStopCommand } from "./commands/stop.js";
import { runResetCommand } from "./commands/reset.js";
import type { ResetMode } from "./orchestration/reset.js";

type OutputFormat = "table" | "json" | "both";

interface ParsedArguments {
  command?: string;
  format?: OutputFormat;
  configPath?: string;
  overridePath?: string;
  showHelp: boolean;
  showVersion: boolean;
  enableProfiles: string[];
  disableProfiles: string[];
  resetMode?: ResetMode;
  resetVolumes: string[];
  removeVolumes: boolean;
}

const SUPPORTED_FORMATS: OutputFormat[] = ["table", "json", "both"];
const SUPPORTED_RESET_MODES: ResetMode[] = ["preserve", "selective", "full"];

const printUsage = (writer: NodeJS.WriteStream = process.stdout): void => {
  writer.write(
    `Usage: dev-bootstrap <command> [options]\n\n` +
      `Commands:\n` +
      `  validate        Validate the dev-bootstrap configuration\n` +
      `  start           Start services defined in the configuration\n` +
      `  stop            Stop services (volumes retained by default)\n` +
      `  reset           Stop services and clean volumes according to policy\n\n` +
      `Options:\n` +
      `  -c, --config <path>    Override configuration file path (default: dev-bootstrap.config.yaml)\n` +
      `  -o, --override <path>  Override local configuration path (default: dev-bootstrap.config.local.yaml)\n` +
      `  -f, --format <mode>    Output format: table | json | both (default: table)\n` +
      `  -h, --help             Show this help message\n` +
      `  -V, --version          Show CLI version\n` +
      `  --profile <name>       (start) Enable profile (repeatable)\n` +
      `  --no-profile <name>    (start) Disable profile (repeatable)\n` +
      `  --remove-volumes       (stop) Remove volumes while stopping\n` +
      `  --mode <mode>          (reset) Reset mode: preserve | selective | full\n` +
      `  --volume <name>        (reset) Volume name for selective removal (repeatable)\n`,
  );
};

const parseArguments = (argv: string[]): ParsedArguments => {
  const tokens = argv.slice(2);
  const parsed: ParsedArguments = {
    showHelp: false,
    showVersion: false,
    enableProfiles: [],
    disableProfiles: [],
    resetVolumes: [],
    removeVolumes: false,
  };

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;

    if (token === "-h" || token === "--help") {
      parsed.showHelp = true;
      index += 1;
      continue;
    }

    if (token === "-V" || token === "--version") {
      parsed.showVersion = true;
      index += 1;
      continue;
    }

    if (token === "-c" || token === "--config") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--config 需要指定路径");
      }
      parsed.configPath = next;
      index += 2;
      continue;
    }

    if (token === "-o" || token === "--override") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--override 需要指定路径");
      }
      parsed.overridePath = next;
      index += 2;
      continue;
    }

    if (token === "-f" || token === "--format") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--format 需要指定输出模式");
      }

      if (!SUPPORTED_FORMATS.includes(next as OutputFormat)) {
        throw new Error(`不支持的输出模式：${next}`);
      }

      parsed.format = next as OutputFormat;
      index += 2;
      continue;
    }

    if (token === "--profile") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--profile 需要指定 profile 名称");
      }
      parsed.enableProfiles.push(next);
      index += 2;
      continue;
    }

    if (token === "--no-profile") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--no-profile 需要指定 profile 名称");
      }
      parsed.disableProfiles.push(next);
      index += 2;
      continue;
    }

    if (token === "--remove-volumes") {
      parsed.removeVolumes = true;
      index += 1;
      continue;
    }

    if (token === "--mode") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--mode 需要指定重置模式");
      }
      if (!SUPPORTED_RESET_MODES.includes(next as ResetMode)) {
        throw new Error(`不支持的重置模式：${next}`);
      }
      parsed.resetMode = next as ResetMode;
      index += 2;
      continue;
    }

    if (token === "--volume") {
      const next = tokens[index + 1];
      if (!next) {
        throw new Error("--volume 需要指定卷名称");
      }
      parsed.resetVolumes.push(next);
      index += 2;
      continue;
    }

    if (!parsed.command && !token.startsWith("-")) {
      parsed.command = token;
      index += 1;
      continue;
    }

    throw new Error(`无法识别的参数：${token}`);
  }

  return parsed;
};

export const runCli = async (
  argv: string[] = process.argv,
  stdout: NodeJS.WriteStream = process.stdout,
  stderr: NodeJS.WriteStream = process.stderr,
): Promise<ExitCode> => {
  let parsed: ParsedArguments;

  try {
    parsed = parseArguments(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`${message}\n`);
    printUsage(stderr);
    return ExitCode.UnexpectedError;
  }

  if (parsed.showHelp) {
    printUsage(stdout);
    return ExitCode.Success;
  }

  if (parsed.showVersion) {
    stdout.write(`dev-bootstrap ${readPackageVersion()}\n`);
    return ExitCode.Success;
  }

  if (!parsed.command) {
    printUsage(stdout);
    return ExitCode.Success;
  }

  switch (parsed.command) {
    case "validate": {
      const result = await runValidateCommand({
        configPath: parsed.configPath,
        overridePath: parsed.overridePath,
        reporterOptions: parsed.format
          ? { outputFormat: parsed.format }
          : undefined,
      });

      return result.exitCode;
    }

    case "start": {
      const result = await runStartCommand({
        configPath: parsed.configPath,
        overridePath: parsed.overridePath,
        enableProfiles: parsed.enableProfiles,
        disableProfiles: parsed.disableProfiles,
        reporterOptions: parsed.format
          ? { outputFormat: parsed.format }
          : undefined,
      });

      return result.exitCode;
    }

    case "stop": {
      const result = await runStopCommand({
        configPath: parsed.configPath,
        overridePath: parsed.overridePath,
        removeVolumes: parsed.removeVolumes,
        reporterOptions: parsed.format
          ? { outputFormat: parsed.format }
          : undefined,
      });

      return result.exitCode;
    }

    case "reset": {
      const result = await runResetCommand({
        configPath: parsed.configPath,
        overridePath: parsed.overridePath,
        mode: parsed.resetMode,
        selectiveVolumes: parsed.resetVolumes,
        reporterOptions: parsed.format
          ? { outputFormat: parsed.format }
          : undefined,
      });

      return result.exitCode;
    }

    default: {
      stderr.write(`未知命令：${parsed.command}\n`);
      printUsage(stderr);
      return ExitCode.UnexpectedError;
    }
  }
};

export default runCli;

const determineDirectExecution = (): boolean => {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const executedFile = process.argv[1]
      ? path.resolve(process.argv[1])
      : undefined;
    return executedFile === currentFile;
  } catch {
    return false;
  }
};

let cachedVersion: string | null = null;

const readPackageVersion = (): string => {
  if (cachedVersion) {
    return cachedVersion;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const packageJsonPath = path.resolve(path.dirname(currentFile), "..", "package.json");
  try {
    const content = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(content) as { version?: string };
    cachedVersion = parsed.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }

  return cachedVersion;
};

if (determineDirectExecution()) {
  runCli()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(ExitCode.UnexpectedError);
    });
}

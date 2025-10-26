import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ExitCode } from "./orchestration/errors";
import { runValidateCommand } from "./commands/validate";

type OutputFormat = "table" | "json" | "both";

interface ParsedArguments {
  command?: string;
  format?: OutputFormat;
  configPath?: string;
  overridePath?: string;
  showHelp: boolean;
}

const SUPPORTED_FORMATS: OutputFormat[] = ["table", "json", "both"];

const printUsage = (writer: NodeJS.WriteStream = process.stdout): void => {
  writer.write(
    `Usage: dev-bootstrap <command> [options]\n\n` +
      `Commands:\n` +
      `  validate        Validate the dev-bootstrap configuration\n\n` +
      `Options:\n` +
      `  -c, --config <path>    Override configuration file path (default: dev-bootstrap.config.yaml)\n` +
      `  -o, --override <path>  Override local configuration path (default: dev-bootstrap.config.local.yaml)\n` +
      `  -f, --format <mode>    Output format: table | json | both (default: table)\n` +
      `  -h, --help             Show this help message\n`,
  );
};

const parseArguments = (argv: string[]): ParsedArguments => {
  const tokens = argv.slice(2);
  const parsed: ParsedArguments = {
    showHelp: false,
  };

  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];

    if (token === "-h" || token === "--help") {
      parsed.showHelp = true;
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

  if (parsed.showHelp || !parsed.command) {
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

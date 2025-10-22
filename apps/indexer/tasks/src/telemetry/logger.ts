import pino, { type Logger, type LoggerOptions } from 'pino';
import { getConfig } from '../bootstrap/config.js';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

const REDACTED_PATHS = [
  'payload.secret',
  'payload.secrets',
  'payload.token',
  'payload.accessToken',
  'payload.refreshToken',
  'payload.authorization',
  'payload.headers.authorization',
  'payload.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'config.database.url',
  'config.queue.url',
  'credentials',
  '*.secret',
  '*.token',
  '*.password'
];

let loggerInstance: Logger | null = null;

const buildLogger = (): Logger => {
  const config = getConfig();
  const level = config.logging.level as LogLevel;

  const options: LoggerOptions = {
    level,
    base: {
      service: 'apps-indexer-tasks',
      environment: config.env
    },
    redact: {
      paths: REDACTED_PATHS,
      remove: true
    }
  };

  if (config.logging.pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        singleLine: true,
        translateTime: 'SYS:standard'
      }
    };
  }

  return pino(options);
};

export const getLogger = (): Logger => {
  if (!loggerInstance) {
    loggerInstance = buildLogger();
  }

  return loggerInstance;
};

export interface JobLogContext {
  jobId: string;
  queueName: string;
  contestId?: string;
  chainId?: number;
  milestone?: string;
  reportId?: string;
  attempt?: number;
}

export const getJobLogger = (context: JobLogContext): Logger =>
  getLogger().child({
    jobId: context.jobId,
    queue: context.queueName,
    contestId: context.contestId,
    chainId: context.chainId,
    milestone: context.milestone,
    reportId: context.reportId,
    attempt: context.attempt
  });

export const resetLogger = (): void => {
  loggerInstance = null;
};

import { randomUUID } from 'node:crypto';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { getEnv } from '@/lib/config/env';

let loggerInstance: Logger | null = null;

const buildLogger = (): Logger => {
  const env = getEnv();

  const options: LoggerOptions = {
    level: env.logging.level ?? 'info',
    base: {
      service: 'apps-api-server',
      environment: env.nodeEnv
    }
  };

  return pino(options);
};

export const getLogger = (): Logger => {
  if (!loggerInstance) {
    loggerInstance = buildLogger();
  }

  return loggerInstance;
};

export interface RequestLogContext {
  traceId?: string;
  sessionId?: string | null;
  route?: string;
  ip?: string;
}

export const getRequestLogger = (context: RequestLogContext = {}): Logger => {
  const baseLogger = getLogger();
  const traceId = context.traceId ?? randomUUID();

  return baseLogger.child({
    traceId,
    sessionId: context.sessionId ?? undefined,
    route: context.route,
    ip: context.ip
  });
};

export const resetLogger = (): void => {
  loggerInstance = null;
};

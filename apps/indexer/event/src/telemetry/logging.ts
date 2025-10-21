import pino, { type Logger, type LoggerOptions } from 'pino';

export interface LoggerConfig {
  level?: LoggerOptions['level'];
  name?: string;
  environment?: string;
}

export interface IngestionLogBindings {
  contestId?: string;
  chainId?: number;
  pipeline?: 'live' | 'replay';
}

export interface RpcLogBindings {
  chainId: number;
  endpointId: string;
}

export const createRootLogger = (config: LoggerConfig = {}): Logger => {
  const { level = process.env.LOG_LEVEL ?? 'info', name = 'indexer-event', environment } = config;

  const base: LoggerOptions = {
    level,
    name,
    base: {
      environment,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return pino(base);
};

export const withIngestionBindings = (
  logger: Logger,
  bindings: IngestionLogBindings,
): Logger => logger.child(cleanUndefined({
  contestId: bindings.contestId,
  chainId: bindings.chainId,
  pipeline: bindings.pipeline,
}));

export const withRpcBindings = (logger: Logger, bindings: RpcLogBindings): Logger =>
  logger.child({
    chainId: bindings.chainId,
    endpointId: bindings.endpointId,
  });

export interface BatchLogFields {
  batchSize: number;
  durationMs: number;
  fromHeight?: bigint | number;
  toHeight?: bigint | number;
  cursor?: string;
  rpcEndpointId?: string;
  error?: unknown;
}

export const logBatchResult = (logger: Logger, fields: BatchLogFields): void => {
  const payload = cleanUndefined({
    batchSize: fields.batchSize,
    durationMs: fields.durationMs,
    fromHeight: normalizeBigInt(fields.fromHeight),
    toHeight: normalizeBigInt(fields.toHeight),
    cursor: fields.cursor,
    rpcEndpointId: fields.rpcEndpointId,
  });

  if (fields.error) {
    logger.error({ ...payload, err: normalizeError(fields.error) }, 'ingestion batch failed');
    return;
  }

  logger.info(payload, 'ingestion batch processed');
};

const normalizeBigInt = (value?: bigint | number): number | undefined => {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value;
};

const normalizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
};

const cleanUndefined = <T extends Record<string, unknown>>(input: T): T => {
  const result = { ...input } as Record<string, unknown>;
  Object.keys(result).forEach((key) => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });

  return result as T;
};

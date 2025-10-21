import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

export interface MetricsConfig {
  prefix?: string;
  defaultLabels?: Record<string, string>;
}

export interface IndexerMetrics {
  registry: Registry;
  ingestionLagBlocks: Gauge<'contestId' | 'chainId'>;
  ingestionBatchDuration: Histogram<'contestId' | 'chainId' | 'pipeline'>;
  ingestionBatchSize: Histogram<'contestId' | 'chainId' | 'pipeline'>;
  rpcFailureCounter: Counter<'chainId' | 'endpointId' | 'reason'>;
  rpcSwitchCounter: Counter<'chainId' | 'fromEndpointId' | 'toEndpointId'>;
}

export const createMetricsRegistry = (config: MetricsConfig = {}): IndexerMetrics => {
  const registry = new Registry();
  const prefix = config.prefix ?? 'indexer_event_';

  if (config.defaultLabels) {
    registry.setDefaultLabels(config.defaultLabels);
  }

  collectDefaultMetrics({ register: registry, prefix });

  const ingestionLagBlocks = new Gauge({
    name: `${prefix}ingestion_lag_blocks`,
    help: 'Current ingestion lag measured in blocks',
    labelNames: ['contestId', 'chainId'] as const,
    registers: [registry],
  });

  const ingestionBatchDuration = new Histogram({
    name: `${prefix}ingestion_batch_duration_ms`,
    help: 'Duration of ingestion batches in milliseconds',
    buckets: [100, 250, 500, 1000, 2000, 4000, 8000, 16000],
    labelNames: ['contestId', 'chainId', 'pipeline'] as const,
    registers: [registry],
  });

  const ingestionBatchSize = new Histogram({
    name: `${prefix}ingestion_batch_size`,
    help: 'Number of events processed per batch',
    buckets: [1, 5, 10, 25, 50, 100, 200, 400],
    labelNames: ['contestId', 'chainId', 'pipeline'] as const,
    registers: [registry],
  });

  const rpcFailureCounter = new Counter({
    name: `${prefix}rpc_failures_total`,
    help: 'Total RPC failures grouped by chain and endpoint',
    labelNames: ['chainId', 'endpointId', 'reason'] as const,
    registers: [registry],
  });

  const rpcSwitchCounter = new Counter({
    name: `${prefix}rpc_switch_total`,
    help: 'Number of automatic RPC endpoint switches',
    labelNames: ['chainId', 'fromEndpointId', 'toEndpointId'] as const,
    registers: [registry],
  });

  return {
    registry,
    ingestionLagBlocks,
    ingestionBatchDuration,
    ingestionBatchSize,
    rpcFailureCounter,
    rpcSwitchCounter,
  };
};

export const serializeMetrics = async (metrics: IndexerMetrics): Promise<string> =>
  metrics.registry.metrics();

export const resetMetrics = (metrics: IndexerMetrics): void => {
  metrics.registry.resetMetrics();
};

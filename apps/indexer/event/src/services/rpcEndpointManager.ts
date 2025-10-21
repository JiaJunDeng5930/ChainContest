import type { Logger } from 'pino';
import type { AppConfig, ChainRpcConfig, RpcEndpointConfig } from '../config/loadConfig.js';
import type { IndexerMetrics } from '../telemetry/metrics.js';

export interface RpcEndpointManagerOptions {
  config: AppConfig;
  logger: Logger;
  metrics: IndexerMetrics;
  clock?: () => number;
}

export interface RpcEndpointSelection {
  chainId: number;
  endpointId: string;
  url: string;
  degraded: boolean;
  cooldownEndsAt?: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
}

export interface RpcFailureEvent {
  chainId: number;
  endpointId: string;
  reason: string;
}

export interface RpcSuccessEvent {
  chainId: number;
  endpointId: string;
}

interface EndpointState {
  readonly config: RpcEndpointConfig;
  failureCount: number;
  cooldownUntil?: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
}

interface ChainState {
  readonly chain: ChainRpcConfig;
  readonly endpoints: EndpointState[];
  activeEndpointId?: string;
  degradedUntil?: number;
}

const toLabelChainId = (chainId: number): string => chainId.toString(10);

export class RpcEndpointManager {
  private readonly chains = new Map<number, ChainState>();

  private readonly logger: Logger;

  private readonly metrics: IndexerMetrics;

  private readonly now: () => number;

  private readonly defaultFailureThreshold: number;

  private readonly defaultCooldownMs: number;

  constructor(options: RpcEndpointManagerOptions) {
    const { config, logger, metrics, clock } = options;
    this.logger = logger.child({ component: 'rpcEndpointManager' });
    this.metrics = metrics;
    this.now = clock ?? Date.now;
    this.defaultFailureThreshold = config.rpc.failureThreshold;
    this.defaultCooldownMs = config.rpc.cooldownMs;

    config.rpc.chains.forEach((chainConfig) => {
      const endpoints = [...chainConfig.endpoints]
        .filter((endpoint) => endpoint.enabled !== false)
        .sort((left, right) => left.priority - right.priority)
        .map<EndpointState>((endpoint) => ({
          config: endpoint,
          failureCount: 0,
        }));

      this.chains.set(chainConfig.chainId, {
        chain: chainConfig,
        endpoints,
        activeEndpointId: endpoints[0]?.config.id,
      });
    });
  }

  public getActiveEndpoint(chainId: number): RpcEndpointSelection | null {
    const state = this.chains.get(chainId);
    if (!state || state.endpoints.length === 0) {
      return null;
    }

    const candidate = this.selectEndpoint(state);
    const active = candidate ?? this.getActiveState(state);
    if (!active) {
      return null;
    }

    if (candidate && candidate.config.id !== state.activeEndpointId) {
      this.emitSwitch(chainId, state.activeEndpointId, candidate.config.id);
      state.activeEndpointId = candidate.config.id;
    }

    const degraded = this.isDegraded(state, active);
    if (!degraded) {
      state.degradedUntil = undefined;
    }

    return {
      chainId,
      endpointId: active.config.id,
      url: active.config.url,
      degraded,
      cooldownEndsAt: active.cooldownUntil,
      lastFailureAt: active.lastFailureAt,
      lastSuccessAt: active.lastSuccessAt,
    };
  }

  public recordFailure(event: RpcFailureEvent): void {
    const state = this.chains.get(event.chainId);
    if (!state) {
      return;
    }

    this.metrics.rpcFailureCounter.inc({
      chainId: toLabelChainId(event.chainId),
      endpointId: event.endpointId,
      reason: event.reason,
    });

    const endpoint = state.endpoints.find((item) => item.config.id === event.endpointId);
    if (!endpoint) {
      return;
    }

    endpoint.failureCount += 1;
    endpoint.lastFailureAt = this.now();

    const threshold = endpoint.config.maxConsecutiveFailures ?? this.defaultFailureThreshold;
    if (endpoint.failureCount < threshold) {
      return;
    }

    endpoint.cooldownUntil = this.now() + (endpoint.config.cooldownMs ?? this.defaultCooldownMs);
    endpoint.failureCount = 0;

    const replacement = this.selectEndpoint(state, event.endpointId);
    if (replacement) {
      this.emitSwitch(event.chainId, endpoint.config.id, replacement.config.id);
      state.activeEndpointId = replacement.config.id;
      return;
    }

    state.degradedUntil = endpoint.cooldownUntil;
    this.logger.warn(
      {
        chainId: event.chainId,
        endpointId: endpoint.config.id,
        cooldownEndsAt: new Date(endpoint.cooldownUntil).toISOString(),
      },
      'all rpc endpoints unavailable; chain entering degraded mode',
    );
  }

  public recordSuccess(event: RpcSuccessEvent): void {
    const state = this.chains.get(event.chainId);
    if (!state) {
      return;
    }

    const endpoint = state.endpoints.find((item) => item.config.id === event.endpointId);
    if (!endpoint) {
      return;
    }

    endpoint.failureCount = 0;
    endpoint.lastSuccessAt = this.now();
    endpoint.cooldownUntil = undefined;

    if (state.activeEndpointId !== endpoint.config.id) {
      this.emitSwitch(event.chainId, state.activeEndpointId, endpoint.config.id);
      state.activeEndpointId = endpoint.config.id;
    }

    state.degradedUntil = undefined;
  }

  public snapshot(): RpcEndpointSelection[] {
    const selections: RpcEndpointSelection[] = [];
    for (const [chainId] of this.chains) {
      const selection = this.getActiveEndpoint(chainId);
      if (selection) {
        selections.push(selection);
      }
    }
    return selections;
  }

  private selectEndpoint(state: ChainState, excludeId?: string): EndpointState | undefined {
    const now = this.now();
    const ordered = state.endpoints
      .filter((endpoint) => endpoint.config.enabled !== false)
      .filter((endpoint) => (excludeId ? endpoint.config.id !== excludeId : true))
      .sort((a, b) => a.config.priority - b.config.priority);

    for (const endpoint of ordered) {
      if (endpoint.cooldownUntil && endpoint.cooldownUntil > now) {
        continue;
      }
      return endpoint;
    }

    return undefined;
  }

  private getActiveState(state: ChainState): EndpointState | undefined {
    if (state.activeEndpointId) {
      const active = state.endpoints.find((endpoint) => endpoint.config.id === state.activeEndpointId);
      if (active) {
        return active;
      }
    }
    return state.endpoints[0];
  }

  private isDegraded(state: ChainState, active: EndpointState): boolean {
    const now = this.now();
    if (active.cooldownUntil && active.cooldownUntil > now) {
      state.degradedUntil = active.cooldownUntil;
      return true;
    }

    if (state.degradedUntil && state.degradedUntil > now) {
      return true;
    }

    return false;
  }

  private emitSwitch(chainId: number, fromId: string | undefined, toId: string): void {
    if (!fromId || fromId === toId) {
      return;
    }

    this.metrics.rpcSwitchCounter.inc({
      chainId: toLabelChainId(chainId),
      fromEndpointId: fromId,
      toEndpointId: toId,
    });

    this.logger.info({ chainId, fromEndpointId: fromId, toEndpointId: toId }, 'rpc endpoint switched');
  }
}

import type { RegistryStream } from './ingestionRegistry.js';
import type { RpcEndpointSelection } from './rpcEndpointManager.js';

export type StreamMode = 'live' | 'replay' | 'paused';

export interface HealthTrackerOptions {
  clock?: () => number;
}

export interface StreamSuccessPayload {
  stream: RegistryStream;
  lagBlocks: number;
  rpc?: RpcEndpointSelection | null;
  nextPollAt?: number | null;
}

export interface StreamFailurePayload {
  stream: RegistryStream;
  reason: string;
  rpc?: RpcEndpointSelection | null;
}

export interface StreamIdentifier {
  contestId: string;
  chainId: number;
}

interface StreamState {
  readonly contestId: string;
  readonly chainId: number;
  mode: StreamMode;
  blockLag: number;
  lastSuccessAt?: number;
  errorStreak: number;
  activeRpc?: string;
  degraded: boolean;
  nextScheduledAt?: number | null;
  lastErrorReason?: string;
}

export interface ServiceHealthStatus {
  status: 'ok' | 'degraded' | 'error';
  reasons: string[];
}

export interface StatusSnapshotStream {
  contestId: string;
  chainId: number;
  blockLag: number;
  lastSuccessAt?: string;
  errorStreak: number;
  activeRpc?: string;
  mode: StreamMode;
  nextScheduledAt?: string | null;
  degraded: boolean;
  lastErrorReason?: string;
}

export interface StatusSnapshot {
  streams: StatusSnapshotStream[];
}

const defaultClock = (): number => Date.now();

export class HealthTracker {
  private readonly states = new Map<string, StreamState>();

  private readonly now: () => number;

  constructor(options: HealthTrackerOptions = {}) {
    this.now = options.clock ?? defaultClock;
  }

  public register(stream: RegistryStream, mode: StreamMode = 'live'): void {
    const key = this.toKey(stream);
    if (!this.states.has(key)) {
      this.states.set(key, {
        contestId: stream.contestId,
        chainId: stream.chainId,
        mode,
        blockLag: 0,
        errorStreak: 0,
        degraded: false,
        nextScheduledAt: null,
      });
      return;
    }

    const existing = this.states.get(key)!;
    existing.mode = mode;
  }

  public recordSuccess(payload: StreamSuccessPayload): void {
    const state = this.ensureState(payload.stream);
    state.blockLag = Math.max(0, payload.lagBlocks);
    state.lastSuccessAt = this.now();
    state.errorStreak = 0;
    state.degraded = payload.rpc?.degraded ?? false;
    state.activeRpc = payload.rpc?.endpointId;
    state.nextScheduledAt = payload.nextPollAt ?? null;
    state.lastErrorReason = undefined;
  }

  public recordFailure(payload: StreamFailurePayload): void {
    const state = this.ensureState(payload.stream);
    state.errorStreak += 1;
    state.degraded = payload.rpc?.degraded ?? false;
    state.activeRpc = payload.rpc?.endpointId;
    state.lastErrorReason = payload.reason;
  }

  public setMode(stream: RegistryStream, mode: StreamMode): void {
    const state = this.ensureState(stream);
    state.mode = mode;
  }

  public getMode(identifier: StreamIdentifier): StreamMode {
    const state = this.states.get(this.toKey(identifier));
    return state?.mode ?? 'live';
  }

  public getState(identifier: StreamIdentifier): StatusSnapshotStream | undefined {
    const state = this.states.get(this.toKey(identifier));
    if (!state) {
      return undefined;
    }

    return {
      contestId: state.contestId,
      chainId: state.chainId,
      blockLag: state.blockLag,
      lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : undefined,
      errorStreak: state.errorStreak,
      activeRpc: state.activeRpc,
      mode: state.mode,
      nextScheduledAt: state.nextScheduledAt ? new Date(state.nextScheduledAt).toISOString() : null,
      degraded: state.degraded,
      lastErrorReason: state.lastErrorReason,
    };
  }

  public getHealth(): ServiceHealthStatus {
    const states = Array.from(this.states.values());
    if (states.length === 0) {
      return { status: 'degraded', reasons: ['no-streams-registered'] };
    }

    const degradedReasons: string[] = [];
    const hasErrors = states.some((state) => state.errorStreak >= 3);
    const hasDegraded = states.some((state) => state.degraded);

    if (hasErrors) {
      degradedReasons.push('error-streak');
    }
    if (hasDegraded) {
      degradedReasons.push('rpc-degraded');
    }

    if (degradedReasons.length > 0) {
      return { status: hasErrors ? 'error' : 'degraded', reasons: degradedReasons };
    }

    return { status: 'ok', reasons: [] };
  }

  public snapshot(): StatusSnapshot {
    const streams: StatusSnapshotStream[] = Array.from(this.states.values()).map((state) => ({
      contestId: state.contestId,
      chainId: state.chainId,
      blockLag: state.blockLag,
      lastSuccessAt: state.lastSuccessAt ? new Date(state.lastSuccessAt).toISOString() : undefined,
      errorStreak: state.errorStreak,
      activeRpc: state.activeRpc,
      mode: state.mode,
      nextScheduledAt: state.nextScheduledAt ? new Date(state.nextScheduledAt).toISOString() : null,
      degraded: state.degraded,
      lastErrorReason: state.lastErrorReason,
    }));

    return { streams };
  }

  private ensureState(stream: RegistryStream): StreamState {
    const key = this.toKey(stream);
    let state = this.states.get(key);
    if (!state) {
      state = {
        contestId: stream.contestId,
        chainId: stream.chainId,
        mode: 'live',
        blockLag: 0,
        errorStreak: 0,
        degraded: false,
        nextScheduledAt: null,
      };
      this.states.set(key, state);
    }

    return state;
  }

  private toKey(stream: StreamIdentifier): string {
    return `${stream.contestId}:${stream.chainId}`;
  }
}

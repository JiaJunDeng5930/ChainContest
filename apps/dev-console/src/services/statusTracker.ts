import type { CallRequest, CallStatus, ErrorDetail } from "../lib/types";

export interface StatusUpdate {
  requestId: string;
  status: CallStatus;
  txHash?: string;
  error?: ErrorDetail;
}

export interface StatusTrackerEvent {
  type: "upsert" | "remove";
  request: CallRequest;
}

type Listener = (event: StatusTrackerEvent) => void;

export class StatusTracker {
  private readonly records = new Map<string, CallRequest>();
  private readonly listeners = new Set<Listener>();

  register(request: CallRequest): CallRequest {
    const copy = this.cloneRequest(request);
    this.records.set(copy.id, copy);
    this.emit({ type: "upsert", request: copy });
    return copy;
  }

  update(update: StatusUpdate): CallRequest | null {
    const current = this.records.get(update.requestId);

    if (!current) {
      return null;
    }

    current.status = update.status;
    current.updatedAt = new Date();

    if (typeof update.txHash === "string") {
      current.txHash = update.txHash;
    }

    if (update.error) {
      current.error = update.error;
    }

    this.emit({ type: "upsert", request: this.cloneRequest(current) });

    return current;
  }

  remove(requestId: string): void {
    const existing = this.records.get(requestId);

    if (!existing) {
      return;
    }

    this.records.delete(requestId);
    this.emit({ type: "remove", request: this.cloneRequest(existing) });
  }

  get(requestId: string): CallRequest | null {
    const request = this.records.get(requestId);
    return request ? this.cloneRequest(request) : null;
  }

  list(): CallRequest[] {
    return Array.from(this.records.values()).map((request) =>
      this.cloneRequest(request),
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: StatusTrackerEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error("StatusTracker listener failed", error);
      }
    });
  }

  private cloneRequest(request: CallRequest): CallRequest {
    return {
      ...request,
      createdAt: new Date(request.createdAt.getTime()),
      updatedAt: new Date(request.updatedAt.getTime()),
      error: request.error ? { ...request.error } : undefined,
      arguments: { ...request.arguments },
    };
  }
}

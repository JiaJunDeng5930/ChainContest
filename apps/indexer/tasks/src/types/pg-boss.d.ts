declare module 'pg-boss' {
  export interface ConstructorOptions {
    connectionString: string;
    application_name?: string;
    retryLimit?: number;
    retryDelay?: number;
    newJobCheckInterval?: number;
    archiveAfter?: string | number;
    deleteAfter?: string | number;
    monitorStateInterval?: number;
  }

  export interface WorkOptions {
    teamSize?: number;
    batchSize?: number;
    includeMetadata?: boolean;
    newJobCheckInterval?: number;
    fetchInterval?: number;
    lockDuration?: number;
    retryLimit?: number;
    retryDelay?: number;
    concurrency?: number;
  }

  export interface PublishOptions {
    priority?: number;
    startAfter?: string | Date;
    expireIn?: string | number;
    retryLimit?: number;
    retryDelay?: number;
    singletonKey?: string;
    singletonMinutes?: number;
    monitorState?: boolean;
  }

  export interface Job<TPayload = unknown> {
    id: string;
    name: string;
    data: TPayload;
    priority: number;
    state: string;
    retrycount: number;
    retrylimit: number;
    startedon?: string;
    completedon?: string;
    singletonKey?: string;
    createdon: string;
    nextiteration?: string;
    keepuntil?: string;
  }

  export type WorkHandler<TPayload> = (job: Job<TPayload>) => Promise<void>;

  class PgBoss {
    constructor(options: ConstructorOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    on(event: 'error', handler: (error: unknown) => void): void;
    off(event: 'error', handler: (error: unknown) => void): void;
    work<TPayload>(queue: string, handler: WorkHandler<TPayload>): Promise<void>;
    work<TPayload>(queue: string, options: WorkOptions, handler: WorkHandler<TPayload>): Promise<void>;
    send<TPayload>(queue: string, payload: TPayload, options?: PublishOptions): Promise<string | null>;
    publish<TPayload>(queue: string, payload: TPayload, options?: PublishOptions): Promise<string | null>;
    schedule<TPayload>(queue: string, cron: string, payload: TPayload, options?: PublishOptions): Promise<string>;
    cancel(jobId: string): Promise<void>;
    complete(jobId: string, data?: unknown): Promise<void>;
    fail(jobId: string, error: unknown): Promise<void>;
    countStates(): Promise<Record<string, unknown>>;
  }

  export default PgBoss;
}

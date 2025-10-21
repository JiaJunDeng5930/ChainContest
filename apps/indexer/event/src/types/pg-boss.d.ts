declare module 'pg-boss' {
  export type ConstructorOptions = {
    connectionString: string;
    application_name?: string;
    retryLimit?: number;
    retryDelay?: number;
    newJobCheckInterval?: number;
  } & Record<string, unknown>;

  class PgBoss {
    constructor(options: ConstructorOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    send<TPayload>(queue: string, payload: TPayload, options?: Record<string, unknown>): Promise<string | null>;
    schedule<TPayload>(
      queue: string,
      cron: string,
      payload: TPayload,
      options?: Record<string, unknown>,
    ): Promise<string>;
    cancel(jobId: string): Promise<void>;
    on(event: 'error', handler: (error: unknown) => void): void;
  }

  export default PgBoss;
}

declare module '@chaincontest/db' {
  export interface ReadIngestionStatusRequest {
    contestId?: string;
    chainId?: number;
    contractAddress?: string;
  }

  export interface ReadIngestionStatusResponse {
    status: 'tracked' | 'untracked';
    cursorHeight: string | null;
    cursorLogIndex: number | null;
    cursorHash: string | null;
    updatedAt: Date | null;
    contestId: string | null;
    chainId: number | null;
    contractAddress: string | null;
  }

  export interface IngestionWriteAction {
    action: string;
    payload: Record<string, unknown>;
    actorContext?: Record<string, unknown> | null;
  }

  export interface WriteIngestionEventResponse {
    status: 'applied' | 'noop';
    cursorHeight?: string;
    cursorLogIndex?: number;
    cursorHash?: string | null;
  }

  export interface WriteContestDomainRequest {
    action: string;
    payload: Record<string, unknown>;
    actorContext?: Record<string, unknown> | null;
  }

  export type WriteContestDomainResponse = Record<string, unknown>;

  export interface DbError extends Error {
    code?: string;
    detail?: Record<string, unknown>;
  }

  export interface MetricsEvent {
    operation: string;
    durationMs: number;
    outcome: 'success' | 'error';
    errorCode?: string;
  }

  export type MetricsHook = (event: MetricsEvent) => void;

  export type MilestoneExecutionStatus = 'pending' | 'in_progress' | 'succeeded' | 'retrying' | 'needs_attention';

  export interface MilestoneExecutionRecord {
    id: string;
    idempotencyKey: string;
    jobId: string;
    contestId: string;
    chainId: number;
    milestone: string;
    sourceTxHash: string;
    sourceLogIndex: number;
    sourceBlockNumber: string;
    status: MilestoneExecutionStatus;
    attempts: number;
    payload: unknown;
    lastError: Record<string, unknown> | null;
    actorContext: Record<string, unknown> | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface UpsertMilestoneExecutionRequest {
    idempotencyKey: string;
    jobId: string;
    contestId: string;
    chainId: number;
    milestone: string;
    sourceTxHash: string;
    sourceLogIndex: number;
    sourceBlockNumber: string;
    payload?: unknown;
    attempt: number;
    status: MilestoneExecutionStatus;
    lastError?: Record<string, unknown> | null;
    actorContext?: Record<string, unknown> | null;
    completedAt?: Date | string | null;
  }

  export interface MilestoneExecutionStatusTransitionRequest {
    idempotencyKey: string;
    toStatus: MilestoneExecutionStatus;
    attempts?: number;
    lastError?: Record<string, unknown> | null;
    actorContext?: Record<string, unknown> | null;
    completedAt?: Date | string | null;
  }

  export interface MilestoneExecutionLookupRequest {
    contestId: string;
    chainId: number;
    milestone: string;
    sourceTxHash: string;
    sourceLogIndex: number;
  }

  export const upsertMilestoneExecution: (request: UpsertMilestoneExecutionRequest) => Promise<MilestoneExecutionRecord>;
  export const updateMilestoneExecutionStatus: (
    request: MilestoneExecutionStatusTransitionRequest
  ) => Promise<MilestoneExecutionRecord>;
  export const getMilestoneExecutionByIdempotencyKey: (
    idempotencyKey: string
  ) => Promise<MilestoneExecutionRecord | null>;
  export const getMilestoneExecutionByEvent: (
    request: MilestoneExecutionLookupRequest
  ) => Promise<MilestoneExecutionRecord | null>;

  export type ReconciliationReportStatus = 'pending_review' | 'in_review' | 'resolved' | 'needs_attention';

  export interface ReconciliationReportLedger {
    id: string;
    idempotencyKey: string;
    reportId: string;
    jobId: string;
    contestId: string;
    chainId: number;
    rangeFromBlock: string;
    rangeToBlock: string;
    generatedAt: Date;
    status: ReconciliationReportStatus;
    attempts: number;
    differences: unknown[];
    notifications: unknown[];
    payload: Record<string, unknown>;
    actorContext: Record<string, unknown> | null;
    lastError: Record<string, unknown> | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }

  export interface UpsertReconciliationReportRequest {
    idempotencyKey: string;
    reportId: string;
    jobId: string;
    contestId: string;
    chainId: number;
    rangeFromBlock: string;
    rangeToBlock: string;
    generatedAt: Date;
    status: ReconciliationReportStatus;
    attempts: number;
    differences: unknown[];
    notifications: unknown[];
    payload: Record<string, unknown>;
    actorContext?: Record<string, unknown> | null;
    lastError?: Record<string, unknown> | null;
    completedAt?: Date | string | null;
  }

  export interface ReconciliationReportStatusTransitionRequest {
    reportId: string;
    toStatus: ReconciliationReportStatus;
    attempts?: number;
    lastError?: Record<string, unknown> | null;
    actorContext?: Record<string, unknown> | null;
    notifications?: unknown[];
    completedAt?: Date | string | null;
  }

  export const upsertReconciliationReport: (
    request: UpsertReconciliationReportRequest
  ) => Promise<ReconciliationReportLedger>;
  export const updateReconciliationReportStatus: (
    request: ReconciliationReportStatusTransitionRequest
  ) => Promise<ReconciliationReportLedger>;
  export const getReconciliationReportByReportId: (
    reportId: string
  ) => Promise<ReconciliationReportLedger | null>;

  export type ErrorLogger = (error: DbError) => void;

  export interface DbInitOptions {
    databaseUrl: string;
    validators: {
      registry: unknown;
      overrides?: unknown;
      environmentId?: string;
    };
    pool?: unknown;
    logger?: boolean;
    metricsHook?: MetricsHook | null;
    errorLogger?: ErrorLogger;
  }

  export const init: (options: DbInitOptions) => Promise<void>;
  export const shutdown: () => Promise<void>;
  export const isInitialised: () => boolean;
}

declare module '@chaincontest/shared-schemas' {
  export interface ValidationContextOptions {
    registry: unknown;
    environmentOverrides?: unknown;
    environmentId?: string;
  }
}

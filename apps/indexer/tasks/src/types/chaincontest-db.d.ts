declare module '@chaincontest/db' {
  export type DbMetricsEvent = any;
  export type DbMetricsHook = any;
  export interface TrackedContestStream {
    contestId: string;
    chainId: number;
    contractAddress: string;
    registrarAddress: string;
    treasuryAddress: string | null;
    settlementAddress: string | null;
    rewardsAddress: string | null;
    startBlock: bigint;
    metadata: Record<string, unknown>;
  }

  export const listTrackedContests: () => Promise<TrackedContestStream[]>;
  export const getMilestoneExecutionByIdempotencyKey: any;
  export const getMilestoneExecutionByEvent: any;
  export const getReconciliationReportByReportId: any;
  export const updateMilestoneExecutionStatus: any;
  export const updateReconciliationReportStatus: any;
  export const upsertMilestoneExecution: any;
  export const upsertReconciliationReport: any;
}

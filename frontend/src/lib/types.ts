export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogSource = "ui" | "validation" | "rpc" | "chainEvent";

export type CallStatus =
  | "draft"
  | "validated"
  | "queued"
  | "submitted"
  | "confirmed"
  | "failed"
  | "rejected"
  | "stalled";

export interface ErrorDetail {
  code: string;
  message: string;
  hint?: string;
  raw?: unknown;
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  timestamp: Date;
  source: LogSource;
  message: string;
  context?: Record<string, unknown>;
}

export interface ContractFunctionParam {
  name: string;
  type: string;
  internalType?: string;
  components?: ContractFunctionParam[];
}

export interface ContractFunction {
  signature: string;
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
  inputs: ContractFunctionParam[];
  outputs?: ContractFunctionParam[];
  payable: boolean;
}

export interface ContractDescriptor {
  id: string;
  name: string;
  address: string;
  abiPath: string;
  tags?: string[];
}

export interface ContractInterface {
  functions: ContractFunction[];
  events: unknown[];
  lastSyncedAt: Date;
}

export interface CallRequest {
  id: string;
  contractId: string;
  functionSignature: string;
  arguments: Record<string, unknown>;
  value?: string;
  status: CallStatus;
  createdAt: Date;
  updatedAt: Date;
  txHash?: string;
  error?: ErrorDetail;
}

export interface EnvironmentConfig {
  rpcUrl: string;
  chainId: number;
  devPort: number;
  defaultAccount?: string;
  contracts: ContractDescriptor[];
}

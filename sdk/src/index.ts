/**
 * Public SDK surface — re-exports everything a consumer needs.
 */

export { LpSuiteClient } from "./client";
export { LpSuiteError } from "./types";
export type {
  LpSuiteConfig,
  Allocation,
  Position,
  TxResult,
  YieldEntry,
  PositionHealth,
  LpAlert,
  SimulateResult,
  SignTransactionFn,
  LpSuiteErrorCode,
} from "./types";

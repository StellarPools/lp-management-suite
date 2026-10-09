/**
 * Shared TypeScript types for the LP Management Suite SDK.
 *
 * All shapes here correspond directly to the contract interface and SDK usage
 * examples described in README.md.  Do not add fields not present in the README.
 */

// ─── Config ─────────────────────────────────────────────────────────────────

/** Signing callback injected by the caller's wallet (Freighter, Albedo, etc.). */
export type SignTransactionFn = (xdr: string) => Promise<string>;

/** Options accepted by LpSuiteClient, per README "SDK Configuration Options". */
export interface LpSuiteConfig {
  /** Deployed aggregator contract ID. */
  contractId: string;
  /** Target network. */
  network: "testnet" | "futurenet" | "mainnet";
  /** Soroban RPC endpoint URL. */
  rpcUrl: string;
  /** User's public key (Stellar account address). */
  account: string;
  /** Wallet-provided signing callback. */
  signTransaction: SignTransactionFn;
  /** RPC retry settings (optional). */
  retry?: {
    attempts?: number;
    backoffMs?: number;
  };
  /** Alert polling interval in milliseconds (default: 30 000). */
  alertPollIntervalMs?: number;
}

// ─── Core data shapes ────────────────────────────────────────────────────────

/** Single pool allocation used in deposit/withdraw calls. */
export interface Allocation {
  poolId: string;
  /** Numeric amount as a decimal string to avoid JS precision issues. */
  amount?: string;
  /** Pass true to withdraw the entire position instead of specifying amount. */
  full?: boolean;
}

/** A user's position in a specific pool, as returned by the contract. */
export interface Position {
  poolId: string;
  shares: string;
  costBasis: string;
  lastCompoundTs: number;
}

/** Result returned by deposit/withdraw/rebalance/compound calls. */
export interface TxResult {
  txHash: string;
  positions: Position[];
}

// ─── Analytics shapes ────────────────────────────────────────────────────────

/** Yield comparison row, per README "Yield Comparison" section. */
export interface YieldEntry {
  poolId: string;
  /** APY as a decimal fraction (0.184 = 18.4%). */
  apy: number;
  /** TVL as a decimal string. */
  tvl: string;
  rewardToken: string;
  /** Fee tier in basis points. */
  feeTierBps: number;
}

/** Health info for a position, per README "Position Health & Alerts" section. */
export interface PositionHealth {
  poolId: string;
  /** Impermanent loss as a percentage (2.1 = 2.1%). */
  impermanentLossPct: number;
  /** Utilization as a decimal fraction (0.78 = 78%). */
  utilization: number;
  /** Concentration as a decimal fraction (0.61 = 61%). */
  concentrationPct: number;
  /** Active alert codes, e.g. ["IL_THRESHOLD_WARNING"]. */
  alerts: string[];
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "warning" | "critical";

/** Alert payload emitted to onAlert subscribers. */
export interface LpAlert {
  poolId: string;
  type: string;
  severity: AlertSeverity;
  timestamp: number;
}

// ─── Simulation ──────────────────────────────────────────────────────────────

/** Result of simulating a transaction without submitting it. */
export interface SimulateResult {
  estimatedFee: string;
  willSucceed: boolean;
  error?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Error codes matching README "Error Handling" section and contract Errors table. */
export type LpSuiteErrorCode =
  | "INVALID_WEIGHTS"
  | "SIMULATION_FAILED"
  | "POOL_NOT_REGISTERED"
  | "INSUFFICIENT_BALANCE"
  | "ADAPTER_CALL_FAILED"
  | "PAUSED"
  | "UNAUTHORIZED"
  | "RPC_ERROR"
  | "UNKNOWN";

/** Typed error thrown by all SDK methods on failure. */
export class LpSuiteError extends Error {
  readonly code: LpSuiteErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: LpSuiteErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "LpSuiteError";
    this.code = code;
    this.details = details;
  }
}

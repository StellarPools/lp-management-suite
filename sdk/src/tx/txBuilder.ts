/**
 * Transaction builder: batches multi-pool operations into the fewest possible
 * Soroban transactions, splitting oversized requests per README
 * "Performance Considerations".
 */

import { MAX_POOLS_PER_TX } from "../constants";
import { Allocation } from "../types";

export interface BuiltTx {
  /** Contract method name. */
  method: string;
  /** Arguments to pass to the contract. */
  args: unknown[];
}

/**
 * Build deposit transactions for a set of allocations.
 * Splits into batches of at most MAX_POOLS_PER_TX allocations.
 */
export function buildDepositTxs(
  user: string,
  allocations: Allocation[]
): BuiltTx[] {
  return chunk(allocations, MAX_POOLS_PER_TX).map((batch) => ({
    method: "deposit",
    args: [user, batch.map((a) => ({ pool_id: a.poolId, amount: a.amount ?? "0" }))],
  }));
}

/**
 * Build withdraw transactions for a set of allocations.
 */
export function buildWithdrawTxs(
  user: string,
  allocations: Allocation[]
): BuiltTx[] {
  return chunk(allocations, MAX_POOLS_PER_TX).map((batch) => ({
    method: "withdraw",
    args: [user, batch.map((a) => ({ pool_id: a.poolId, amount: a.full ? "0" : (a.amount ?? "0") }))],
  }));
}

/**
 * Build a rebalance transaction.
 * target_weights map (pool_id -> basis points, must sum to 10 000).
 */
export function buildRebalanceTx(
  user: string,
  targetWeights: Record<string, number>
): BuiltTx {
  return {
    method: "rebalance",
    args: [user, targetWeights],
  };
}

/**
 * Build compound transactions for a list of pool IDs.
 */
export function buildCompoundTxs(
  user: string,
  poolIds: string[]
): BuiltTx[] {
  return chunk(poolIds, MAX_POOLS_PER_TX).map((batch) => ({
    method: "compound",
    args: [user, batch],
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

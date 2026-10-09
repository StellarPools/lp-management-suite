/**
 * Historical metrics aggregation.
 *
 * Provides helpers for computing aggregated analytics over historical event
 * data fetched from the Soroban RPC (contract events / ledger changes).
 * Used internally by the CSV export and could be exposed for charting.
 */

import { SorobanRpcClient } from "../rpc/sorobanRpcClient";

export interface HistoricalEvent {
  date: string;
  txHash: string;
  poolId: string;
  action: "deposit" | "withdraw" | "compound" | "rebalance";
  amount: string;
  token: string;
  rewardAmount: string;
  rewardToken: string;
  costBasis: string;
  realizedGain: string;
}

/**
 * Fetch historical LP events for `account` between `from` and `to` (ISO date strings).
 *
 * In the real implementation this would query the Soroban RPC for contract
 * events filtered by the user's address and the aggregator's contract ID.
 * The mock implementation returns an empty array until a live RPC is wired in.
 */
export async function fetchHistoricalEvents(
  rpc: SorobanRpcClient,
  account: string,
  from: string,
  to: string
): Promise<HistoricalEvent[]> {
  // Fetch events from the contract via read-only call.
  const raw = await rpc.callReadOnly("get_history", [account, from, to]);
  if (!Array.isArray(raw)) return [];

  return (raw as Record<string, unknown>[]).map((e) => ({
    date: String(e?.date ?? ""),
    txHash: String(e?.tx_hash ?? ""),
    poolId: String(e?.pool_id ?? ""),
    action: (e?.action as HistoricalEvent["action"]) ?? "deposit",
    amount: String(e?.amount ?? "0"),
    token: String(e?.token ?? "XLM"),
    rewardAmount: String(e?.reward_amount ?? "0"),
    rewardToken: String(e?.reward_token ?? "XLM"),
    costBasis: String(e?.cost_basis ?? "0"),
    realizedGain: String(e?.realized_gain ?? "0"),
  }));
}

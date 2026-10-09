/**
 * Multi-pool deposit logic, per README "Multi-Pool Deposit & Rebalancing".
 */

import { Allocation, LpSuiteConfig, Position, TxResult } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { buildDepositTxs } from "../tx/txBuilder";
import { simulateAll } from "../tx/simulate";
import { signAndSubmitAll } from "../tx/signAndSubmit";

export interface DepositParams {
  allocations: Allocation[];
}

export async function deposit(
  config: LpSuiteConfig,
  rpc: SorobanRpcClient,
  params: DepositParams
): Promise<TxResult> {
  const txs = buildDepositTxs(config.account, params.allocations);

  // Simulate all batches before signing.
  await simulateAll(rpc, txs);

  // Sign and submit each batch.
  const results = await signAndSubmitAll(rpc, txs, config.signTransaction);
  const txHash = results[results.length - 1]?.txHash ?? "";

  // Fetch updated positions.
  const positions: Position[] = await rpc.getPositions(config.account);

  return { txHash, positions };
}

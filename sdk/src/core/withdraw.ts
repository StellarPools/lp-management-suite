/**
 * Multi-pool withdrawal logic, per README "Withdrawals".
 */

import { Allocation, LpSuiteConfig, Position, TxResult } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { buildWithdrawTxs } from "../tx/txBuilder";
import { simulateAll } from "../tx/simulate";
import { signAndSubmitAll } from "../tx/signAndSubmit";

export interface WithdrawParams {
  allocations: Allocation[];
}

export async function withdraw(
  config: LpSuiteConfig,
  rpc: SorobanRpcClient,
  params: WithdrawParams
): Promise<TxResult> {
  const txs = buildWithdrawTxs(config.account, params.allocations);

  await simulateAll(rpc, txs);

  const results = await signAndSubmitAll(rpc, txs, config.signTransaction);
  const txHash = results[results.length - 1]?.txHash ?? "";

  const positions: Position[] = await rpc.getPositions(config.account);

  return { txHash, positions };
}

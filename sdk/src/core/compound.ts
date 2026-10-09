/**
 * Reward claim and reinvestment (auto-compound), per README "Auto-Compound Rewards".
 */

import { LpSuiteConfig, Position, TxResult } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { buildCompoundTxs } from "../tx/txBuilder";
import { simulateAll } from "../tx/simulate";
import { signAndSubmitAll } from "../tx/signAndSubmit";

export interface CompoundParams {
  poolIds: string[];
}

export async function compound(
  config: LpSuiteConfig,
  rpc: SorobanRpcClient,
  params: CompoundParams
): Promise<TxResult> {
  const txs = buildCompoundTxs(config.account, params.poolIds);

  await simulateAll(rpc, txs);

  const results = await signAndSubmitAll(rpc, txs, config.signTransaction);
  const txHash = results[results.length - 1]?.txHash ?? "";

  const positions: Position[] = await rpc.getPositions(config.account);

  return { txHash, positions };
}

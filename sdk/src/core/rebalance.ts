/**
 * Target-weight rebalancing, per README "Rebalancing".
 *
 * Target weights must sum to 1.0 across the included pools.
 * Internally weights are converted to basis points (10 000 = 100%) before
 * being passed to the contract, which uses integer arithmetic.
 */

import { LpSuiteConfig, LpSuiteError, Position, TxResult } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { buildRebalanceTx } from "../tx/txBuilder";
import { simulateTx } from "../tx/simulate";
import { signAndSubmit } from "../tx/signAndSubmit";
import { WEIGHT_PRECISION } from "../constants";

export interface RebalanceParams {
  targetWeights: Record<string, number>;
}

export async function rebalance(
  config: LpSuiteConfig,
  rpc: SorobanRpcClient,
  params: RebalanceParams
): Promise<TxResult> {
  // Validate weights sum to 1.0 (within floating-point tolerance).
  const total = Object.values(params.targetWeights).reduce((s, w) => s + w, 0);
  if (Math.abs(total - 1.0) > 1e-9) {
    throw new LpSuiteError(
      "INVALID_WEIGHTS",
      `Target weights must sum to 1.0; got ${total}`
    );
  }

  // Convert decimal weights to basis points for the contract.
  const bpsWeights: Record<string, number> = {};
  for (const [poolId, w] of Object.entries(params.targetWeights)) {
    bpsWeights[poolId] = Math.round(w * WEIGHT_PRECISION);
  }

  const tx = buildRebalanceTx(config.account, bpsWeights);

  await simulateTx(rpc, tx);

  const result = await signAndSubmit(rpc, tx, config.signTransaction);

  const positions: Position[] = await rpc.getPositions(config.account);

  return { txHash: result.txHash, positions };
}

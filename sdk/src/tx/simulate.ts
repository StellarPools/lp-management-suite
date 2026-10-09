/**
 * Pre-flight transaction simulation.
 *
 * Simulates a transaction before requesting a user signature, per README
 * "Transaction Simulation" section.  Throws `LpSuiteError` with code
 * `SIMULATION_FAILED` if the simulation indicates failure.
 */

import { LpSuiteError, SimulateResult } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { BuiltTx } from "./txBuilder";

/**
 * Simulate a single built transaction.
 * Returns fee estimate and success flag.  Throws on simulation failure.
 */
export async function simulateTx(
  rpc: SorobanRpcClient,
  tx: BuiltTx
): Promise<SimulateResult> {
  const result = await rpc.simulate(tx.method, tx.args);
  if (!result.willSucceed) {
    throw new LpSuiteError(
      "SIMULATION_FAILED",
      `Simulation for "${tx.method}" failed: ${result.error ?? "unknown reason"}`,
      { method: tx.method, error: result.error }
    );
  }
  return {
    estimatedFee: result.estimatedFee,
    willSucceed: result.willSucceed,
    error: result.error,
  };
}

/**
 * Simulate multiple transactions (for batched multi-pool calls).
 * Returns the sum of estimated fees and overall success.
 */
export async function simulateAll(
  rpc: SorobanRpcClient,
  txs: BuiltTx[]
): Promise<SimulateResult> {
  let totalFee = 0;
  for (const tx of txs) {
    const result = await simulateTx(rpc, tx);
    totalFee += parseInt(result.estimatedFee, 10) || 0;
  }
  return {
    estimatedFee: String(totalFee),
    willSucceed: true,
  };
}

/**
 * Cross-pool yield comparison, per README "Cross-Pool Yield Comparison".
 *
 * Fetches yield data from each adapter in parallel and normalizes it into a
 * common shape so pools can be compared regardless of which protocol they
 * belong to.
 */

import { YieldEntry } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";

/**
 * Return yield data for each pool in `poolIds`, normalized to the
 * shape described in README's "Yield Comparison" example.
 *
 * Fetches adapters in parallel so response time scales with the slowest
 * adapter, not the sum, per README "Performance Considerations".
 */
export async function compareYields(
  rpc: SorobanRpcClient,
  poolIds: string[]
): Promise<YieldEntry[]> {
  const results = await Promise.all(
    poolIds.map((poolId) => rpc.getPoolYield(poolId))
  );
  return results;
}

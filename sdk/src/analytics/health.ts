/**
 * Position health computation, per README "Position Health Monitoring & Alerts".
 *
 * Fetches health metrics from the contract for all of a user's pools.
 */

import { PositionHealth } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";

/**
 * Return health info for all pools in which `account` has a position.
 */
export async function getPositionHealth(
  rpc: SorobanRpcClient,
  account: string
): Promise<PositionHealth[]> {
  const positions = await rpc.getPositions(account);
  if (positions.length === 0) return [];

  // Fetch health for all pools in parallel.
  const results = await Promise.all(
    positions.map((pos) => rpc.getHealth(account, pos.poolId))
  );
  return results;
}

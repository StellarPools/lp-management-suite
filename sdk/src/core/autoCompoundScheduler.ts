/**
 * Auto-compound scheduler: registers / cancels scheduled compounding intent
 * on-chain, to be picked up by the keeper service.
 *
 * setAutoCompound and cancelAutoCompound store the user's compounding
 * preferences in the aggregator contract so the keeper can poll them.
 * Per README: "setAutoCompound only registers intent on-chain, it does not
 * run anything itself without the keeper polling for it."
 */

import { LpSuiteConfig, LpSuiteError } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { signAndSubmit } from "../tx/signAndSubmit";
import { simulateTx } from "../tx/simulate";

export interface AutoCompoundParams {
  poolIds: string[];
  frequencyHours: number;
}

export interface CancelAutoCompoundParams {
  poolIds: string[];
}

export async function setAutoCompound(
  config: LpSuiteConfig,
  rpc: SorobanRpcClient,
  params: AutoCompoundParams
): Promise<void> {
  if (params.frequencyHours <= 0) {
    throw new LpSuiteError(
      "UNKNOWN",
      "frequencyHours must be a positive number"
    );
  }

  const tx = {
    method: "set_auto_compound",
    args: [config.account, params.poolIds, params.frequencyHours],
  };

  await simulateTx(rpc, tx);
  await signAndSubmit(rpc, tx, config.signTransaction);
}

export async function cancelAutoCompound(
  config: LpSuiteConfig,
  rpc: SorobanRpcClient,
  params: CancelAutoCompoundParams
): Promise<void> {
  const tx = {
    method: "cancel_auto_compound",
    args: [config.account, params.poolIds],
  };

  await simulateTx(rpc, tx);
  await signAndSubmit(rpc, tx, config.signTransaction);
}

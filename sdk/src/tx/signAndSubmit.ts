/**
 * Sign and submit a transaction to the Soroban network.
 *
 * This module separates the signing step (wallet callback) from the submission
 * step (RPC call), keeping the wallet integration stateless.
 */

import { LpSuiteError, SignTransactionFn } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { BuiltTx } from "./txBuilder";

export interface SubmitResult {
  txHash: string;
}

/**
 * Sign a transaction XDR using the provided wallet callback, then submit it.
 *
 * In production this would build real XDR using @stellar/stellar-sdk,
 * pass it to `signTransaction`, and submit the signed result.
 */
export async function signAndSubmit(
  rpc: SorobanRpcClient,
  tx: BuiltTx,
  signTransaction: SignTransactionFn
): Promise<SubmitResult> {
  // Build a placeholder XDR string representing the transaction.
  // In the real implementation this would be constructed via the Stellar SDK.
  const unsignedXdr = JSON.stringify({ method: tx.method, args: tx.args });

  let signedXdr: string;
  try {
    signedXdr = await signTransaction(unsignedXdr);
  } catch (err) {
    throw new LpSuiteError(
      "UNKNOWN",
      `Transaction signing failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const result = await rpc.submitTransaction(signedXdr);
  return { txHash: result.txHash };
}

/**
 * Submit multiple transactions sequentially (for batched requests that were
 * split across several contract calls due to per-tx pool limits).
 */
export async function signAndSubmitAll(
  rpc: SorobanRpcClient,
  txs: BuiltTx[],
  signTransaction: SignTransactionFn
): Promise<SubmitResult[]> {
  const results: SubmitResult[] = [];
  for (const tx of txs) {
    results.push(await signAndSubmit(rpc, tx, signTransaction));
  }
  return results;
}

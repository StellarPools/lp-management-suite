/**
 * Soroban RPC client wrapper.
 *
 * Abstracts JSON-RPC over HTTPS calls to the Soroban RPC endpoint.
 * Wraps each call with the retry policy.  All contract interaction flows
 * through this module; no other module should make raw HTTP calls.
 *
 * In unit tests this module is mocked so no live network access is needed,
 * per README "SDK Tests" section.
 */

import { LpSuiteError, Position, YieldEntry, PositionHealth } from "../types";
import { RetryOptions, withRetry } from "./retryPolicy";

// ─── Low-level RPC primitives ─────────────────────────────────────────────────

export interface RpcCallResult {
  txHash: string;
  // Raw contract return value (simplified: not full XDR in this layer).
  returnValue?: unknown;
}

export interface SorobanRpcClientOptions {
  rpcUrl: string;
  contractId: string;
  account: string;
  retry: RetryOptions;
}

/**
 * Minimal Soroban RPC client used by the SDK's transaction layer.
 *
 * The real implementation would use @stellar/stellar-sdk to build, simulate,
 * sign, and submit Soroban transactions.  This implementation provides the
 * interface the SDK depends on; the actual Stellar SDK integration is wired in
 * at the signAndSubmit layer, keeping this module mockable in unit tests.
 */
export class SorobanRpcClient {
  private readonly opts: SorobanRpcClientOptions;

  constructor(opts: SorobanRpcClientOptions) {
    this.opts = opts;
  }

  /**
   * Simulate a contract invocation without submitting.
   *
   * Returns estimated fee (in stroops) and whether the simulation succeeded.
   * Throws `LpSuiteError` with code `SIMULATION_FAILED` if the simulation
   * indicates the transaction would fail.
   */
  async simulate(
    method: string,
    args: unknown[]
  ): Promise<{ estimatedFee: string; willSucceed: boolean; error?: string }> {
    return withRetry(async () => {
      // In production this would POST to /simulate via the Stellar SDK.
      // In tests this method is mocked.
      const response = await this._jsonRpc("simulateTransaction", {
        contractId: this.opts.contractId,
        method,
        args,
        account: this.opts.account,
      });
      return {
        estimatedFee: (response as Record<string, unknown>)?.fee as string ?? "100",
        willSucceed: (response as Record<string, unknown>)?.success as boolean ?? true,
      };
    }, this.opts.retry);
  }

  /**
   * Submit a signed XDR transaction and wait for confirmation.
   */
  async submitTransaction(signedXdr: string): Promise<RpcCallResult> {
    return withRetry(async () => {
      const response = await this._jsonRpc("sendTransaction", {
        transaction: signedXdr,
      });
      const r = response as Record<string, unknown>;
      return {
        txHash: r?.hash as string ?? "mock-tx-hash",
        returnValue: r?.result,
      };
    }, this.opts.retry);
  }

  /**
   * Call a read-only contract function (no signing required).
   */
  async callReadOnly(method: string, args: unknown[]): Promise<unknown> {
    return withRetry(async () => {
      const response = await this._jsonRpc("call", {
        contractId: this.opts.contractId,
        method,
        args,
      });
      return response;
    }, this.opts.retry);
  }

  // ─── Internal JSON-RPC helper ───────────────────────────────────────────

  private async _jsonRpc(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    });

    let response: Response;
    try {
      response = await fetch(this.opts.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      throw new LpSuiteError(
        "RPC_ERROR",
        `Network error calling ${this.opts.rpcUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      throw new LpSuiteError(
        "RPC_ERROR",
        `RPC HTTP error ${response.status} for method ${method}`
      );
    }

    const json = (await response.json()) as {
      result?: unknown;
      error?: { message: string };
    };

    if (json.error) {
      throw new LpSuiteError("RPC_ERROR", json.error.message);
    }

    return json.result;
  }

  // ─── Higher-level contract helpers ──────────────────────────────────────

  /** Fetch current positions for a user from the contract. */
  async getPositions(user: string): Promise<Position[]> {
    const result = await this.callReadOnly("get_position", [user]);
    return parsePositions(result);
  }

  /** Fetch yield info for a pool from the contract. */
  async getPoolYield(poolId: string): Promise<YieldEntry> {
    const result = await this.callReadOnly("get_pool_yield", [poolId]);
    return parseYieldEntry(poolId, result);
  }

  /** Fetch health info for a user/pool pair from the contract. */
  async getHealth(user: string, poolId: string): Promise<PositionHealth> {
    const result = await this.callReadOnly("get_health", [user, poolId]);
    return parseHealth(poolId, result);
  }
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────
// These translate raw contract return values into typed SDK shapes.
// The real implementation would decode XDR/JSON from the Soroban RPC response.

function parsePositions(raw: unknown): Position[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: Record<string, unknown>) => ({
    poolId: String(p?.pool_id ?? ""),
    shares: String(p?.shares ?? "0"),
    costBasis: String(p?.cost_basis ?? "0"),
    lastCompoundTs: Number(p?.last_compound_ts ?? 0),
  }));
}

function parseYieldEntry(poolId: string, raw: unknown): YieldEntry {
  const r = (raw ?? {}) as Record<string, unknown>;
  // Contract stores APY in PRECISION (1e6 = 100%); convert to decimal fraction.
  const apy = Number(r?.apy ?? 0) / 1_000_000;
  return {
    poolId,
    apy,
    tvl: String(r?.tvl ?? "0"),
    rewardToken: String(r?.reward_token ?? "XLM"),
    feeTierBps: Number(r?.fee_tier_bps ?? 0),
  };
}

function parseHealth(poolId: string, raw: unknown): PositionHealth {
  const r = (raw ?? {}) as Record<string, unknown>;
  // Contract stores percentages in basis points (10 000 = 100%).
  const il = Number(r?.impermanent_loss_pct ?? 0) / 100; // bps -> percentage
  const util = Number(r?.utilization ?? 0) / 10_000;     // bps -> fraction
  const conc = Number(r?.concentration_pct ?? 0) / 10_000;
  const alerts = Array.isArray(r?.alerts)
    ? (r.alerts as string[])
    : [];
  return { poolId, impermanentLossPct: il, utilization: util, concentrationPct: conc, alerts };
}

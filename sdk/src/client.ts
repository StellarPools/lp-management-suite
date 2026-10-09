/**
 * LpSuiteClient — primary integration point for all SDK functionality.
 *
 * Accepts the configuration options from README "SDK Configuration Options"
 * and exposes every method described in README "SDK Usage".
 */

import { validateConfig, ValidatedConfig } from "./config";
import {
  LpSuiteConfig,
  LpSuiteError,
  Allocation,
  TxResult,
  YieldEntry,
  PositionHealth,
  LpAlert,
  SimulateResult,
} from "./types";
import { SorobanRpcClient } from "./rpc/sorobanRpcClient";
import { deposit } from "./core/deposit";
import { withdraw } from "./core/withdraw";
import { rebalance } from "./core/rebalance";
import { compound } from "./core/compound";
import {
  setAutoCompound,
  cancelAutoCompound,
  AutoCompoundParams,
  CancelAutoCompoundParams,
} from "./core/autoCompoundScheduler";
import { compareYields } from "./analytics/yieldCompare";
import { getPositionHealth } from "./analytics/health";
import { exportHistoryCsv, CsvExportParams } from "./export/csvExport";
import { AlertEmitter } from "./alerts/alertEmitter";
import { buildDepositTxs, buildRebalanceTx, buildCompoundTxs } from "./tx/txBuilder";
import { simulateAll, simulateTx } from "./tx/simulate";
import { WEIGHT_PRECISION } from "./constants";

export class LpSuiteClient {
  private readonly config: ValidatedConfig;
  private readonly rpc: SorobanRpcClient;
  private readonly alertEmitter: AlertEmitter;

  constructor(userConfig: LpSuiteConfig) {
    this.config = validateConfig(userConfig);
    this.rpc = new SorobanRpcClient({
      rpcUrl: this.config.rpcUrl,
      contractId: this.config.contractId,
      account: this.config.account,
      retry: this.config.retry,
    });
    this.alertEmitter = new AlertEmitter(
      this.rpc,
      this.config.account,
      this.config.alertPollIntervalMs
    );
  }

  // ─── Core transaction methods ──────────────────────────────────────────────

  /**
   * Deposit into multiple pools in a single aggregator call.
   * Per README "Multi-Pool Deposit" example.
   */
  async deposit(params: { allocations: Allocation[] }): Promise<TxResult> {
    return deposit(this.config, this.rpc, params);
  }

  /**
   * Withdraw from one or more pools.
   * Per README "Withdrawals" example.
   */
  async withdraw(params: { allocations: Allocation[] }): Promise<TxResult> {
    return withdraw(this.config, this.rpc, params);
  }

  /**
   * Rebalance positions to target weights (decimal fractions summing to 1.0).
   * Per README "Rebalancing" example.
   */
  async rebalance(params: {
    targetWeights: Record<string, number>;
  }): Promise<TxResult> {
    return rebalance(this.config, this.rpc, params);
  }

  /**
   * Claim rewards and reinvest for the specified pools.
   * Per README "Auto-Compound" example.
   */
  async compound(params: { poolIds: string[] }): Promise<TxResult> {
    return compound(this.config, this.rpc, params);
  }

  /**
   * Register auto-compound intent on-chain for the keeper service.
   * Per README "Auto-Compound" scheduled form.
   */
  async setAutoCompound(params: AutoCompoundParams): Promise<void> {
    return setAutoCompound(this.config, this.rpc, params);
  }

  /**
   * Cancel auto-compound registrations for the specified pools.
   */
  async cancelAutoCompound(params: CancelAutoCompoundParams): Promise<void> {
    return cancelAutoCompound(this.config, this.rpc, params);
  }

  // ─── Analytics methods ──────────────────────────────────────────────────────

  /**
   * Compare yields across the given pool IDs.
   * Per README "Yield Comparison" example.
   */
  async compareYields(poolIds: string[]): Promise<YieldEntry[]> {
    return compareYields(this.rpc, poolIds);
  }

  /**
   * Get health metrics for all of the user's positions.
   * Per README "Position Health & Alerts" example.
   */
  async getPositionHealth(account: string): Promise<PositionHealth[]> {
    return getPositionHealth(this.rpc, account);
  }

  // ─── Alert subscription ──────────────────────────────────────────────────────

  /**
   * Subscribe to health alerts.  Returns an unsubscribe function.
   * Per README "Position Health & Alerts" onAlert example.
   */
  onAlert(callback: (alert: LpAlert) => void): () => void {
    return this.alertEmitter.subscribe(callback);
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  /**
   * Export LP history as CSV for tax reporting.
   * Per README "CSV Export" example.
   */
  async exportHistoryCsv(params: CsvExportParams): Promise<string> {
    return exportHistoryCsv(this.rpc, params);
  }

  // ─── Simulation namespace ────────────────────────────────────────────────────

  /**
   * Explicit simulation without submission, per README "Transaction Simulation".
   */
  readonly simulate = {
    deposit: async (params: {
      allocations: Allocation[];
    }): Promise<SimulateResult> => {
      const txs = buildDepositTxs(this.config.account, params.allocations);
      return simulateAll(this.rpc, txs);
    },

    rebalance: async (params: {
      targetWeights: Record<string, number>;
    }): Promise<SimulateResult> => {
      const total = Object.values(params.targetWeights).reduce(
        (s, w) => s + w,
        0
      );
      if (Math.abs(total - 1.0) > 1e-9) {
        throw new LpSuiteError(
          "INVALID_WEIGHTS",
          `Target weights must sum to 1.0; got ${total}`
        );
      }
      const bpsWeights: Record<string, number> = {};
      for (const [id, w] of Object.entries(params.targetWeights)) {
        bpsWeights[id] = Math.round(w * WEIGHT_PRECISION);
      }
      const tx = buildRebalanceTx(this.config.account, bpsWeights);
      return simulateTx(this.rpc, tx);
    },

    compound: async (params: {
      poolIds: string[];
    }): Promise<SimulateResult> => {
      const txs = buildCompoundTxs(this.config.account, params.poolIds);
      return simulateAll(this.rpc, txs);
    },
  };
}

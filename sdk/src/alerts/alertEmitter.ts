/**
 * Alert emitter: polls health data and notifies subscribers when thresholds
 * are crossed, per README "Position Health Monitoring & Alerts".
 *
 * Polling interval is controlled by `alertPollIntervalMs` from the SDK config
 * (default: 30 000 ms).
 */

import { LpAlert, PositionHealth } from "../types";
import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { DEFAULT_THRESHOLDS, AlertThresholds } from "./thresholds";

type AlertCallback = (alert: LpAlert) => void;

export class AlertEmitter {
  private readonly rpc: SorobanRpcClient;
  private readonly account: string;
  private readonly pollIntervalMs: number;
  private readonly thresholds: AlertThresholds;
  private readonly subscribers = new Set<AlertCallback>();
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor(
    rpc: SorobanRpcClient,
    account: string,
    pollIntervalMs: number,
    thresholds?: Partial<AlertThresholds>
  ) {
    this.rpc = rpc;
    this.account = account;
    this.pollIntervalMs = pollIntervalMs;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Subscribe to alerts.  Starts polling if this is the first subscriber.
   * Returns an unsubscribe function.
   */
  subscribe(callback: AlertCallback): () => void {
    this.subscribers.add(callback);
    if (this.subscribers.size === 1) {
      this.startPolling();
    }
    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0) {
        this.stopPolling();
      }
    };
  }

  // ─── Polling ───────────────────────────────────────────────────────────────

  private startPolling(): void {
    const tick = async () => {
      try {
        await this.poll();
      } finally {
        if (this.subscribers.size > 0) {
          this.timerId = setTimeout(tick, this.pollIntervalMs);
        }
      }
    };
    this.timerId = setTimeout(tick, this.pollIntervalMs);
  }

  private stopPolling(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private async poll(): Promise<void> {
    const positions = await this.rpc.getPositions(this.account);
    if (positions.length === 0) return;

    const healthResults = await Promise.all(
      positions.map((p) => this.rpc.getHealth(this.account, p.poolId))
    );

    for (const health of healthResults) {
      this.evaluateAndEmit(health);
    }
  }

  // ─── Threshold evaluation ──────────────────────────────────────────────────

  private evaluateAndEmit(health: PositionHealth): void {
    const now = Date.now();

    const ilAbs = Math.abs(health.impermanentLossPct);
    if (ilAbs > this.thresholds.ilWarningPct) {
      this.emit({
        poolId: health.poolId,
        type: "IL_THRESHOLD_WARNING",
        severity: ilAbs > this.thresholds.ilWarningPct * 2 ? "critical" : "warning",
        timestamp: now,
      });
    }

    if (health.utilization > this.thresholds.utilizationWarning) {
      this.emit({
        poolId: health.poolId,
        type: "UTILIZATION_WARNING",
        severity: "warning",
        timestamp: now,
      });
    }

    if (health.concentrationPct > this.thresholds.concentrationWarning) {
      this.emit({
        poolId: health.poolId,
        type: "CONCENTRATION_WARNING",
        severity: "info",
        timestamp: now,
      });
    }
  }

  private emit(alert: LpAlert): void {
    for (const cb of this.subscribers) {
      try {
        cb(alert);
      } catch {
        // Subscriber errors must not crash the emitter.
      }
    }
  }
}

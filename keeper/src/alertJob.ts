/**
 * Alert job — polls health data for all tracked positions and re-emits
 * alerts to any configured webhook or queue.
 *
 * Per README "Keeper Service": the keeper "polls health data and re-emits
 * alerts to any configured webhook/queue".
 */

import { logger } from "./logger";

export interface HealthAlert {
  account: string;
  poolId: string;
  type: string;
  severity: "info" | "warning" | "critical";
  timestamp: number;
}

/**
 * Fetch current health alerts from the aggregator for all tracked accounts.
 *
 * Real implementation: call get_health() for each known position via the
 * Soroban RPC and evaluate against the configured thresholds (stored on-chain
 * via set_health_thresholds).
 */
export async function fetchAlerts(
  rpcUrl: string,
  contractId: string
): Promise<HealthAlert[]> {
  logger.debug("fetchAlerts called", { rpcUrl, contractId });
  // Returns empty until a live contract is wired in.
  return [];
}

/**
 * Forward an alert to the configured webhook URL (if LP_SUITE_ALERT_WEBHOOK
 * is set in the environment).
 */
export async function forwardAlert(alert: HealthAlert): Promise<void> {
  const webhookUrl = process.env.LP_SUITE_ALERT_WEBHOOK;
  if (!webhookUrl) {
    logger.debug("No webhook configured; logging alert only", alert);
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alert),
    });
    if (!response.ok) {
      logger.warn("Webhook returned non-200", {
        status: response.status,
        alert,
      });
    }
  } catch (err) {
    logger.error("Failed to forward alert to webhook", {
      error: err instanceof Error ? err.message : String(err),
      alert,
    });
  }
}

/**
 * Run one alert job tick: fetch alerts and forward each one.
 */
export async function runAlertJob(
  rpcUrl: string,
  contractId: string
): Promise<void> {
  const alerts = await fetchAlerts(rpcUrl, contractId);

  for (const alert of alerts) {
    logger.warn("Health alert detected", alert);
    await forwardAlert(alert);
  }

  logger.info("Alert job tick complete", { alertCount: alerts.length });
}

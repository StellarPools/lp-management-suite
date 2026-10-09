/**
 * Alert threshold configuration, per README "Position Health Monitoring & Alerts".
 */

/** Default thresholds (in the same units as the SDK PositionHealth fields). */
export const DEFAULT_THRESHOLDS = {
  /** IL percentage that triggers a warning (e.g. 2.0 = 2%). */
  ilWarningPct: 2.0,
  /** Utilization fraction that triggers a warning (e.g. 0.9 = 90%). */
  utilizationWarning: 0.9,
  /** Concentration fraction that triggers a warning (e.g. 0.7 = 70%). */
  concentrationWarning: 0.7,
};

export type AlertThresholds = typeof DEFAULT_THRESHOLDS;

/** Merge caller-supplied overrides with the defaults. */
export function buildThresholds(
  overrides?: Partial<AlertThresholds>
): AlertThresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

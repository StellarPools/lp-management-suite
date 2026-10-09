/**
 * Impermanent loss calculations for the SDK analytics layer.
 *
 * These are the client-side equivalents of the Rust math in
 * contracts/shared/math, used when the SDK needs to compute IL locally
 * (e.g., for trend charts or historical metrics) rather than calling the
 * on-chain function.
 */

/**
 * Compute impermanent loss as a decimal fraction (negative = loss).
 *
 * Classic constant-product AMM IL formula:
 *   IL = 2 * sqrt(r) / (1 + r) - 1
 * where r = currentPrice / entryPrice.
 *
 * @param priceRatio currentPrice / entryPrice (1.0 = unchanged).
 * @returns Decimal fraction, e.g. -0.057 for a 5.7% loss.
 */
export function impermanentLoss(priceRatio: number): number {
  if (priceRatio <= 0) return 0;
  return (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
}

/**
 * Compute the price ratio that would produce the given IL percentage.
 * Useful for "how far must price move before IL hits X%?" calculations.
 *
 * @param ilFraction Target IL as a negative decimal (e.g. -0.05 for -5%).
 * @returns Approximate price ratio (above 1.0 means price went up).
 */
export function priceRatioForIL(ilFraction: number): number {
  // Invert the IL formula numerically via binary search.
  if (ilFraction >= 0) return 1.0;
  const target = 1 + ilFraction; // target IL as a multiplier
  let lo = 1.0;
  let hi = 1000.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const val = (2 * Math.sqrt(mid)) / (1 + mid);
    if (val > target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

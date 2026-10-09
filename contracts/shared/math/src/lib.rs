#![no_std]

/// Fixed-point precision: all percentages and ratios use 1_000_000 (1e6) as 100%.
pub const PRECISION: i128 = 1_000_000;

/// Compute impermanent loss (IL) as a fraction in PRECISION units.
///
/// IL formula for a 50/50 constant-product AMM:
///   IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
///
/// Inputs:
///   `price_ratio` — current price relative to entry price, in PRECISION units.
///                   e.g., 1_000_000 means price unchanged, 2_000_000 means 2x.
///
/// Returns:
///   IL as a negative fraction in PRECISION units (e.g., -25_000 = -2.5%).
pub fn impermanent_loss(price_ratio: i128) -> i128 {
    if price_ratio <= 0 {
        return 0;
    }
    // sqrt approximation via Newton-Raphson (integer square root of price_ratio * PRECISION)
    let sqrt_pr = isqrt(price_ratio * PRECISION);
    // IL = 2 * sqrt_pr / (PRECISION + price_ratio) - PRECISION
    // Numerator: 2 * sqrt_pr * PRECISION
    let numerator = 2 * sqrt_pr * PRECISION;
    let denominator = PRECISION + price_ratio;
    if denominator == 0 {
        return 0;
    }
    (numerator / denominator) - PRECISION
}

/// Integer square root (floor) via Newton-Raphson.
pub fn isqrt(n: i128) -> i128 {
    if n < 0 {
        return 0;
    }
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

/// Fixed-point multiplication: (a * b) / PRECISION
pub fn fp_mul(a: i128, b: i128) -> i128 {
    a * b / PRECISION
}

/// Fixed-point division: (a * PRECISION) / b
pub fn fp_div(a: i128, b: i128) -> i128 {
    if b == 0 {
        return 0;
    }
    a * PRECISION / b
}

/// Compute utilization as a fraction in PRECISION units.
///
/// `active_liquidity` — liquidity currently earning fees.
/// `total_liquidity`  — total liquidity in the pool.
pub fn utilization(active_liquidity: i128, total_liquidity: i128) -> i128 {
    if total_liquidity == 0 {
        return 0;
    }
    fp_div(active_liquidity, total_liquidity)
}

/// Compute concentration risk as a fraction in PRECISION units.
///
/// `position_value` — value of the user's position in this pool.
/// `total_portfolio` — sum of all LP positions for the user.
pub fn concentration(position_value: i128, total_portfolio: i128) -> i128 {
    if total_portfolio == 0 {
        return 0;
    }
    fp_div(position_value, total_portfolio)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isqrt() {
        assert_eq!(isqrt(0), 0);
        assert_eq!(isqrt(1), 1);
        assert_eq!(isqrt(4), 2);
        assert_eq!(isqrt(9), 3);
        assert_eq!(isqrt(16), 4);
        assert_eq!(isqrt(100), 10);
    }

    #[test]
    fn test_fp_mul() {
        // 0.5 * 0.5 = 0.25
        assert_eq!(fp_mul(500_000, 500_000), 250_000);
        // 1.0 * 1.0 = 1.0
        assert_eq!(fp_mul(PRECISION, PRECISION), PRECISION);
    }

    #[test]
    fn test_fp_div() {
        // 1.0 / 2.0 = 0.5
        assert_eq!(fp_div(PRECISION, 2 * PRECISION), 500_000);
        // divide by zero
        assert_eq!(fp_div(PRECISION, 0), 0);
    }

    #[test]
    fn test_il_unchanged_price() {
        // price unchanged -> IL = 0
        let il = impermanent_loss(PRECISION);
        assert_eq!(il, 0);
    }

    #[test]
    fn test_il_2x_price() {
        // price 2x: IL ≈ -5.7%  (classic result)
        let il = impermanent_loss(2 * PRECISION);
        // il is negative; magnitude should be around 57_000 (5.7%)
        assert!(il < 0, "IL should be negative");
        assert!(il > -100_000, "IL should not exceed -10%");
    }

    #[test]
    fn test_utilization() {
        assert_eq!(utilization(500_000, 1_000_000), 500_000); // 50%
        assert_eq!(utilization(0, 1_000_000), 0);
        assert_eq!(utilization(1_000_000, 0), 0);
    }

    #[test]
    fn test_concentration() {
        assert_eq!(concentration(250_000, 1_000_000), 250_000); // 25%
        assert_eq!(concentration(0, 1_000_000), 0);
        assert_eq!(concentration(1_000_000, 0), 0);
    }
}

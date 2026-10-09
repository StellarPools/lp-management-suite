use soroban_sdk::{Address, Env, String, Vec};

use crate::router::get_pool_yield;
use crate::storage::{get_health_thresholds, get_position};
use crate::types::{HealthInfo, PoolId};

/// Compute on-chain health metrics for a user's position in a given pool.
///
/// Metrics returned (per README's "Position Health Monitoring & Alerts"):
/// - `impermanent_loss_pct`: IL relative to a simple hold strategy, in basis
///   points (10 000 = 100 %).  Derived from cost-basis vs. current share value.
/// - `utilization`: How much of the pool's liquidity is actively earning fees,
///   expressed in basis points.  Derived from pool TVL vs. position value.
/// - `concentration_pct`: The user's share of their own total portfolio that
///   sits in this single pool, in basis points.
/// - `alerts`: Any threshold-crossing alert codes as described in README.
pub fn get_health(env: &Env, user: &Address, pool_id: &PoolId) -> HealthInfo {
    let positions = get_position(env, user);

    // Find the position for the requested pool.
    let position = positions.iter().find(|p| &p.pool_id == pool_id);

    let (shares, cost_basis) = match position {
        Some(p) => (p.shares, p.cost_basis),
        None => {
            return HealthInfo {
                pool_id: pool_id.clone(),
                impermanent_loss_pct: 0,
                utilization: 0,
                concentration_pct: 0,
                alerts: Vec::new(env),
            };
        }
    };

    // Compute total portfolio value across all positions (sum of shares).
    let total_portfolio: i128 = positions.iter().map(|p| p.shares).fold(0, |a, b| a + b);

    // Concentration: this position's shares / total portfolio shares (basis points).
    let concentration_pct = if total_portfolio > 0 {
        (shares * 10_000) / total_portfolio
    } else {
        0
    };

    // Impermanent loss: difference between current share value and cost basis,
    // expressed as basis points relative to cost basis.
    let il_pct = if cost_basis > 0 {
        let diff = shares - cost_basis; // positive means gain, negative means IL
        (diff * 10_000) / cost_basis    // negative value when IL present
    } else {
        0
    };

    // Utilization: approximate as (position shares / pool TVL) * 10 000.
    // Pool TVL is fetched from the adapter via get_pool_yield.
    let yield_info = get_pool_yield(env, pool_id);
    let utilization = if yield_info.tvl > 0 {
        (shares * 10_000) / yield_info.tvl
    } else {
        0
    };

    // Evaluate threshold-based alerts.
    let thresholds = get_health_thresholds(env);
    let mut alerts: Vec<String> = Vec::new(env);

    if let Some(t) = thresholds {
        // il_pct is negative when there is impermanent loss;
        // compare absolute value against threshold.
        let il_abs = if il_pct < 0 { -il_pct } else { il_pct };
        if il_abs > t.il_limit {
            alerts.push_back(String::from_str(env, "IL_THRESHOLD_WARNING"));
        }
        if utilization > t.utilization_limit {
            alerts.push_back(String::from_str(env, "UTILIZATION_WARNING"));
        }
        if concentration_pct > t.concentration_limit {
            alerts.push_back(String::from_str(env, "CONCENTRATION_WARNING"));
        }
    }

    HealthInfo {
        pool_id: pool_id.clone(),
        impermanent_loss_pct: il_pct,
        utilization,
        concentration_pct,
        alerts,
    }
}

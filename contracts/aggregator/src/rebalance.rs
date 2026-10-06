use soroban_sdk::{Address, Env, Map, String};

use crate::errors::Error;
use crate::events::Rebalance;
use crate::router::{call_deposit, call_withdraw, get_adapter_address};
use crate::storage::{get_pool_config, get_position, is_paused, set_position};
use crate::types::{PoolId, Position};

const WEIGHT_PRECISION: i128 = 10000; // basis points

pub fn rebalance(
    env: &Env,
    user: &Address,
    target_weights: &Map<PoolId, i128>,
) -> Result<(), Error> {
    if is_paused(env) {
        return Err(Error::Paused);
    }

    let total_weight: i128 = target_weights.values().into_iter().fold(0, |acc, w| acc + w);
    if total_weight != WEIGHT_PRECISION {
        return Err(Error::InvalidWeights);
    }

    // Validate that all pools in target_weights are registered and active
    for pool_id in target_weights.keys().into_iter() {
        let pool_config = get_pool_config(env, &pool_id).ok_or(Error::PoolNotRegistered)?;
        if !pool_config.active {
            return Err(Error::PoolNotRegistered);
        }
    }

    let current_positions = get_position(env, user);
    let mut current_total_value: i128 = 0;
    for pos in current_positions.iter() {
        let adapter_addr = get_adapter_address(env, &pos.pool_id);
        if adapter_addr.is_ok() {
            current_total_value += pos.shares;
        }
    }

    if current_total_value == 0 {
        return Err(Error::InsufficientBalance);
    }

    let mut target_shares: Map<PoolId, i128> = Map::new(env);
    for (pool_id, weight) in target_weights.iter() {
        let target = (current_total_value * weight) / WEIGHT_PRECISION;
        target_shares.set(pool_id, target);
    }

    for pos in current_positions.iter() {
        let target = target_shares.get(pos.pool_id.clone()).unwrap_or(0);
        let diff = target - pos.shares;

        if diff > 0 {
            let pool_config = get_pool_config(env, &pos.pool_id).ok_or(Error::PoolNotRegistered)?;
            if !pool_config.active {
                return Err(Error::PoolNotRegistered);
            }

            let shares_minted = call_deposit(env, &pos.pool_id, user, diff)?;
            let new_shares = pos.shares + shares_minted;
            let new_cost_basis = pos.cost_basis + diff;

            let new_position = Position {
                pool_id: pos.pool_id.clone(),
                shares: new_shares,
                cost_basis: new_cost_basis,
                last_compound_ts: pos.last_compound_ts,
            };
            set_position(env, user, &pos.pool_id, &new_position);

            Rebalance {
                user: user.clone(),
                from_pool: String::from_str(env, ""),
                to_pool: pos.pool_id.clone(),
                amount: shares_minted,
            }.publish(env);
        } else if diff < 0 {
            let shares_to_withdraw = -diff;
            let pool_config = get_pool_config(env, &pos.pool_id).ok_or(Error::PoolNotRegistered)?;
            if !pool_config.active {
                return Err(Error::PoolNotRegistered);
            }

            let _returned_amount = call_withdraw(env, &pos.pool_id, user, shares_to_withdraw)?;
            let new_shares = pos.shares - shares_to_withdraw;
            let new_cost_basis = if pos.shares > 0 {
                (pos.cost_basis * new_shares) / pos.shares
            } else {
                0
            };

            let new_position = Position {
                pool_id: pos.pool_id.clone(),
                shares: new_shares,
                cost_basis: new_cost_basis,
                last_compound_ts: pos.last_compound_ts,
            };
            set_position(env, user, &pos.pool_id, &new_position);

            Rebalance {
                user: user.clone(),
                from_pool: pos.pool_id.clone(),
                to_pool: String::from_str(env, ""),
                amount: shares_to_withdraw,
            }.publish(env);
        }
    }

    Ok(())
}

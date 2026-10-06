use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::events::Withdraw;
use crate::router::call_withdraw;
use crate::storage::{get_pool_config, get_position, is_paused, set_position};
use crate::types::{Allocation, Position};

pub fn withdraw(env: &Env, user: &Address, allocations: &Vec<Allocation>) -> Result<(), Error> {
    if is_paused(env) {
        return Err(Error::Paused);
    }

    for allocation in allocations.iter() {
        let pool_id = allocation.pool_id.clone();
        let amount = allocation.amount;

        if amount <= 0 {
            continue;
        }

        let pool_config = get_pool_config(env, &pool_id).ok_or(Error::PoolNotRegistered)?;
        if !pool_config.active {
            return Err(Error::PoolNotRegistered);
        }

        let positions = get_position(env, user);
        let position = positions.iter().find(|p| p.pool_id == pool_id).ok_or(Error::InsufficientBalance)?;

        let shares_to_withdraw = if amount >= position.shares {
            position.shares
        } else {
            amount
        };

        if shares_to_withdraw <= 0 {
            return Err(Error::InsufficientBalance);
        }

        let returned_amount = call_withdraw(env, &pool_id, user, shares_to_withdraw)?;

        let new_shares = position.shares - shares_to_withdraw;
        let new_cost_basis = if position.shares > 0 {
            (position.cost_basis * new_shares) / position.shares
        } else {
            0
        };

        let new_position = Position {
            pool_id: pool_id.clone(),
            shares: new_shares,
            cost_basis: new_cost_basis,
            last_compound_ts: position.last_compound_ts,
        };
        set_position(env, user, &pool_id, &new_position);

        Withdraw {
            user: user.clone(),
            pool_id: pool_id.clone(),
            amount: returned_amount,
            shares: shares_to_withdraw,
        }.publish(env);
    }

    Ok(())
}

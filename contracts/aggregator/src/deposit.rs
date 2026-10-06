use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::events::Deposit;
use crate::router::call_deposit;
use crate::storage::{get_pool_config, is_paused, set_position};
use crate::types::{Allocation, Position};

pub fn deposit(env: &Env, user: &Address, allocations: &Vec<Allocation>) -> Result<(), Error> {
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

        let shares = call_deposit(env, &pool_id, user, amount)?;

        let position = Position {
            pool_id: pool_id.clone(),
            shares,
            cost_basis: amount,
            last_compound_ts: env.ledger().timestamp(),
        };
        set_position(env, user, &pool_id, &position);

        Deposit {
            user: user.clone(),
            pool_id: pool_id.clone(),
            amount,
            shares,
        }.publish(env);
    }

    Ok(())
}

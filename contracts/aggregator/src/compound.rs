use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::events::Compound;
use crate::router::{call_claim_rewards, call_deposit};
use crate::storage::{get_position, is_paused, set_position};
use crate::types::PoolId;

/// Claim rewards from each specified pool and reinvest them back into the
/// same position (auto-compound).
///
/// For each pool_id in `pool_ids`:
/// 1. Call `claim_rewards` on the adapter → receive reward_amount.
/// 2. If reward_amount > 0, call `deposit` on the same pool with the
///    reward_amount → receive additional shares.
/// 3. Update the position's shares, cost_basis, and last_compound_ts.
/// 4. Emit a `compound` event with the payload from README's Events table.
pub fn compound(env: &Env, user: &Address, pool_ids: &Vec<PoolId>) -> Result<(), Error> {
    if is_paused(env) {
        return Err(Error::Paused);
    }

    for pool_id in pool_ids.iter() {
        // Claim accrued rewards from the adapter.
        let reward_amount = call_claim_rewards(env, &pool_id, user)?;

        if reward_amount <= 0 {
            // Nothing to reinvest; skip without error.
            continue;
        }

        // Reinvest reward into the same position.
        let new_shares = call_deposit(env, &pool_id, user, reward_amount)?;

        // Update stored position.
        let positions = get_position(env, user);
        let mut found = false;
        for pos in positions.iter() {
            if pos.pool_id == pool_id {
                let updated = crate::types::Position {
                    pool_id: pos.pool_id.clone(),
                    shares: pos.shares + new_shares,
                    cost_basis: pos.cost_basis + reward_amount,
                    last_compound_ts: env.ledger().timestamp(),
                };
                set_position(env, user, &pool_id, &updated);
                found = true;
                break;
            }
        }

        // If no existing position, create one from the compounded rewards.
        if !found {
            let new_position = crate::types::Position {
                pool_id: pool_id.clone(),
                shares: new_shares,
                cost_basis: reward_amount,
                last_compound_ts: env.ledger().timestamp(),
            };
            set_position(env, user, &pool_id, &new_position);
        }

        // Emit compound event.
        Compound {
            user: user.clone(),
            pool_id: pool_id.clone(),
            reward_amount,
            reinvested_amount: new_shares,
        }
        .publish(env);
    }

    Ok(())
}

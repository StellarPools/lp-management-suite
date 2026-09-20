mod admin;
mod compound;
mod deposit;
mod errors;
mod events;
mod health;
mod rebalance;
mod router;
mod storage;
mod types;
mod withdraw;

use soroban_sdk::{contract, contractimpl, Address, Env, Map, Vec};

use crate::errors::Error;
use crate::types::{Allocation, HealthInfo, HealthThresholds, PoolId, Position, YieldInfo};

#[contract]
pub struct AggregatorContract;

#[contractimpl]
impl AggregatorContract {
    pub fn deposit(env: Env, user: Address, allocations: Vec<Allocation>) -> Result<(), Error> {
        deposit::deposit(&env, &user, &allocations)
    }

    pub fn withdraw(env: Env, user: Address, allocations: Vec<Allocation>) -> Result<(), Error> {
        withdraw::withdraw(&env, &user, &allocations)
    }

    pub fn rebalance(
        env: Env,
        user: Address,
        target_weights: Map<PoolId, i128>,
    ) -> Result<(), Error> {
        rebalance::rebalance(&env, &user, &target_weights)
    }

    pub fn compound(env: Env, user: Address, pool_ids: Vec<PoolId>) -> Result<(), Error> {
        compound::compound(&env, &user, &pool_ids)
    }

    pub fn get_position(env: Env, user: Address) -> Vec<Position> {
        storage::get_position(&env, &user)
    }

    pub fn get_pool_yield(env: Env, pool_id: PoolId) -> YieldInfo {
        router::get_pool_yield(&env, &pool_id)
    }

    pub fn get_health(env: Env, user: Address, pool_id: PoolId) -> HealthInfo {
        health::get_health(&env, &user, &pool_id)
    }

    pub fn register_pool(
        env: Env,
        admin: Address,
        pool_id: PoolId,
        adapter_address: Address,
    ) -> Result<(), Error> {
        admin::register_pool(&env, &admin, &pool_id, &adapter_address)
    }

    pub fn deregister_pool(env: Env, admin: Address, pool_id: PoolId) -> Result<(), Error> {
        admin::deregister_pool(&env, &admin, &pool_id)
    }

    pub fn set_health_thresholds(
        env: Env,
        admin: Address,
        thresholds: HealthThresholds,
    ) -> Result<(), Error> {
        admin::set_health_thresholds(&env, &admin, &thresholds)
    }

    pub fn pause(env: Env, admin: Address) -> Result<(), Error> {
        admin::pause(&env, &admin)
    }

    pub fn unpause(env: Env, admin: Address) -> Result<(), Error> {
        admin::unpause(&env, &admin)
    }

    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) -> Result<(), Error> {
        admin::transfer_admin(&env, &admin, &new_admin)
    }
}

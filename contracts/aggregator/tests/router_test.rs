#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::mock_adapter::create_mock_adapter;
use aggregator::AggregatorContract;
use aggregator::storage::{set_admin, set_pool_config, PoolConfig};

mod mock_adapter;

fn setup(env: &Env) -> (Address, String) {
    let admin = Address::generate(env);
    let pool_a = String::from_str(env, "pool-a");

    let contract_id = env.register(AggregatorContract, ());
    env.as_contract(&contract_id, || {
        set_admin(env, &admin);
        let mock_a = create_mock_adapter(env);
        set_pool_config(env, &pool_a, &PoolConfig { adapter_address: mock_a, active: true });
    });

    (contract_id, pool_a)
}

#[test]
fn test_get_adapter_address_registered_pool() {
    let env = Env::default();
    let (contract_id, pool_a) = setup(&env);

    env.as_contract(&contract_id, || {
        let result = aggregator::router::get_adapter_address(&env, &pool_a);
        assert!(result.is_ok(), "should return adapter address for registered pool");
    });
}

#[test]
fn test_get_adapter_address_unregistered_pool() {
    let env = Env::default();
    let (contract_id, _pool_a) = setup(&env);

    env.as_contract(&contract_id, || {
        let unknown = String::from_str(&env, "no-such-pool");
        let result = aggregator::router::get_adapter_address(&env, &unknown);
        assert!(result.is_err(), "unregistered pool should return error");
    });
}

#[test]
fn test_call_deposit_via_router() {
    let env = Env::default();
    let (contract_id, pool_a) = setup(&env);
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let shares = aggregator::router::call_deposit(&env, &pool_a, &user, 500);
        assert!(shares.is_ok());
        assert_eq!(shares.unwrap(), 500);
    });
}

#[test]
fn test_call_withdraw_via_router() {
    let env = Env::default();
    let (contract_id, pool_a) = setup(&env);
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        // First deposit so there are shares to withdraw.
        aggregator::router::call_deposit(&env, &pool_a, &user, 500).unwrap();
        let returned = aggregator::router::call_withdraw(&env, &pool_a, &user, 200);
        assert!(returned.is_ok());
        assert_eq!(returned.unwrap(), 200);
    });
}

#[test]
fn test_call_claim_rewards_via_router() {
    let env = Env::default();
    let (contract_id, pool_a) = setup(&env);
    let user = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let reward = aggregator::router::call_claim_rewards(&env, &pool_a, &user);
        assert!(reward.is_ok());
        // MockAdapter always returns 100 as the reward.
        assert_eq!(reward.unwrap(), 100);
    });
}

#[test]
fn test_get_pool_yield_via_router() {
    let env = Env::default();
    let (contract_id, pool_a) = setup(&env);

    env.as_contract(&contract_id, || {
        let yield_info = aggregator::router::get_pool_yield(&env, &pool_a);
        assert_eq!(yield_info.pool_id, pool_a);
        assert_eq!(yield_info.fee_tier_bps, 30);
        assert!(yield_info.apy > 0);
    });
}

#[test]
fn test_get_pool_yield_unregistered_returns_zeros() {
    let env = Env::default();
    let (contract_id, _pool_a) = setup(&env);

    env.as_contract(&contract_id, || {
        let unknown = String::from_str(&env, "ghost-pool");
        let yield_info = aggregator::router::get_pool_yield(&env, &unknown);
        assert_eq!(yield_info.apy, 0);
        assert_eq!(yield_info.tvl, 0);
    });
}

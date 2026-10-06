#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, Map, String};

use crate::mock_adapter::create_mock_adapter;
use aggregator::{AggregatorContract, Error, Allocation};
use aggregator::storage::{set_admin, set_pool_config, PoolConfig, get_position, set_paused};
use aggregator::deposit;
use aggregator::rebalance;

mod mock_adapter;

fn setup_with_deposit(env: &Env) -> (Address, Address, String, String) {
    let admin = Address::generate(env);
    let user = Address::generate(env);
    let pool_a = String::from_str(env, "pool-a");
    let pool_b = String::from_str(env, "pool-b");

    let contract_id = env.register(AggregatorContract, ());
    env.as_contract(&contract_id, || {
        set_admin(env, &admin);

        let mock_a = create_mock_adapter(env);
        let mock_b = create_mock_adapter(env);

        let config_a = PoolConfig {
            adapter_address: mock_a,
            active: true,
        };
        let config_b = PoolConfig {
            adapter_address: mock_b,
            active: true,
        };
        set_pool_config(env, &pool_a, &config_a);
        set_pool_config(env, &pool_b, &config_b);

        let alloc = soroban_sdk::Vec::from_array(&env, [
            Allocation {
                pool_id: pool_a.clone(),
                amount: 5000,
            },
            Allocation {
                pool_id: pool_b.clone(),
                amount: 5000,
            },
        ]);

        deposit::deposit(env, &user, &alloc).unwrap();
    });

    (user, contract_id, pool_a, pool_b)
}

fn rebalance_in_contract(env: &Env, contract_id: &Address, user: &Address, target_weights: &Map<String, i128>) -> Result<(), Error> {
    env.as_contract(contract_id, || {
        rebalance::rebalance(env, user, target_weights)
    })
}

fn get_positions_in_contract(env: &Env, contract_id: &Address, user: &Address) -> soroban_sdk::Vec<aggregator::types::Position> {
    env.as_contract(contract_id, || {
        get_position(env, user)
    })
}

#[test]
fn test_rebalance_equal_weights() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    let mut target_weights = Map::new(&env);
    target_weights.set(pool_a.clone(), 5000);
    target_weights.set(pool_b.clone(), 5000);

    let result = rebalance_in_contract(&env, &contract_id, &user, &target_weights);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    let pos_a = positions.iter().find(|p| p.pool_id == pool_a).unwrap();
    let pos_b = positions.iter().find(|p| p.pool_id == pool_b).unwrap();
    assert_eq!(pos_a.shares, pos_b.shares);
}

#[test]
fn test_rebalance_shift_weights() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    let mut target_weights = Map::new(&env);
    target_weights.set(pool_a.clone(), 8000);
    target_weights.set(pool_b.clone(), 2000);

    let result = rebalance_in_contract(&env, &contract_id, &user, &target_weights);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    let pos_a = positions.iter().find(|p| p.pool_id == pool_a).unwrap();
    let pos_b = positions.iter().find(|p| p.pool_id == pool_b).unwrap();
    assert!(pos_a.shares > pos_b.shares);
}

#[test]
fn test_rebalance_invalid_weights_sum_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    let mut target_weights = Map::new(&env);
    target_weights.set(pool_a.clone(), 6000);
    target_weights.set(pool_b.clone(), 6000);

    let result = rebalance_in_contract(&env, &contract_id, &user, &target_weights);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::InvalidWeights);
}

#[test]
fn test_rebalance_weights_sum_too_low_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    let mut target_weights = Map::new(&env);
    target_weights.set(pool_a.clone(), 4000);
    target_weights.set(pool_b.clone(), 4000);

    let result = rebalance_in_contract(&env, &contract_id, &user, &target_weights);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::InvalidWeights);
}

#[test]
fn test_rebalance_unregistered_pool_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    let mut target_weights = Map::new(&env);
    let unknown_pool = String::from_str(&env, "unknown-pool");
    target_weights.set(unknown_pool, 5000);
    target_weights.set(pool_b.clone(), 5000);

    let result = rebalance_in_contract(&env, &contract_id, &user, &target_weights);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::PoolNotRegistered);
}

#[test]
fn test_rebalance_paused_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    env.as_contract(&contract_id, || {
        set_paused(&env, true);
    });

    let mut target_weights = Map::new(&env);
    target_weights.set(pool_a.clone(), 5000);
    target_weights.set(pool_b.clone(), 5000);

    let result = rebalance_in_contract(&env, &contract_id, &user, &target_weights);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::Paused);
}
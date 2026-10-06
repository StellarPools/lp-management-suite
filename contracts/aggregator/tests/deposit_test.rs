#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

use crate::mock_adapter::create_mock_adapter;
use aggregator::{AggregatorContract, Error, Allocation};
use aggregator::storage::{set_admin, set_pool_config, PoolConfig, get_position};

mod mock_adapter;

fn setup(env: &Env) -> (Address, Address, String, String) {
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
    });

    (user, contract_id, pool_a, pool_b)
}

fn deposit_in_contract(env: &Env, contract_id: &Address, user: &Address, alloc: &Vec<Allocation>) -> Result<(), Error> {
    env.as_contract(contract_id, || {
        aggregator::deposit::deposit(env, user, alloc)
    })
}

fn get_positions_in_contract(env: &Env, contract_id: &Address, user: &Address) -> Vec<aggregator::types::Position> {
    env.as_contract(contract_id, || {
        get_position(env, user)
    })
}

#[test]
fn test_deposit_single_pool() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup(&env);

    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: pool_a.clone(),
        amount: 1000,
    }]);

    let result = deposit_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    assert_eq!(positions.len(), 1);
    assert_eq!(positions.get(0).unwrap().pool_id, pool_a);
    assert_eq!(positions.get(0).unwrap().shares, 1000);
    assert_eq!(positions.get(0).unwrap().cost_basis, 1000);
}

#[test]
fn test_deposit_multiple_pools() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup(&env);

    let alloc = Vec::from_array(&env, [
        Allocation {
            pool_id: pool_a.clone(),
            amount: 1000,
        },
        Allocation {
            pool_id: pool_b.clone(),
            amount: 2000,
        },
    ]);

    let result = deposit_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    assert_eq!(positions.len(), 2);
}

#[test]
fn test_deposit_unregistered_pool_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup(&env);

    let unknown_pool = String::from_str(&env, "unknown-pool");
    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: unknown_pool,
        amount: 1000,
    }]);

    let result = deposit_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::PoolNotRegistered);
}

#[test]
fn test_deposit_paused_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup(&env);

    env.as_contract(&contract_id, || {
        aggregator::storage::set_paused(&env, true);
    });

    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: pool_a,
        amount: 1000,
    }]);

    let result = deposit_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::Paused);
}

#[test]
fn test_deposit_zero_amount_skipped() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup(&env);

    let alloc = Vec::from_array(&env, [
        Allocation {
            pool_id: pool_a.clone(),
            amount: 1000,
        },
        Allocation {
            pool_id: pool_b.clone(),
            amount: 0,
        },
    ]);

    let result = deposit_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    assert_eq!(positions.len(), 1);
    assert_eq!(positions.get(0).unwrap().pool_id, pool_a);
}
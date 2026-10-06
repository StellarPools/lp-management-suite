#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

use crate::mock_adapter::create_mock_adapter;
use aggregator::{AggregatorContract, Error, Allocation};
use aggregator::storage::{set_admin, set_pool_config, PoolConfig, get_position, set_paused};

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

        aggregator::deposit::deposit(env, &user, &alloc).unwrap();
    });

    (user, contract_id, pool_a, pool_b)
}

fn withdraw_in_contract(env: &Env, contract_id: &Address, user: &Address, alloc: &Vec<Allocation>) -> Result<(), Error> {
    env.as_contract(contract_id, || {
        aggregator::withdraw::withdraw(env, user, alloc)
    })
}

fn get_positions_in_contract(env: &Env, contract_id: &Address, user: &Address) -> Vec<aggregator::types::Position> {
    env.as_contract(contract_id, || {
        get_position(env, user)
    })
}

#[test]
fn test_withdraw_single_pool() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup_with_deposit(&env);

    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: pool_a.clone(),
        amount: 400,
    }]);

    let result = withdraw_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    let pos_a = positions.iter().find(|p| p.pool_id == pool_a).unwrap();
    assert_eq!(pos_a.shares, 600);
    assert_eq!(pos_a.cost_basis, 600);
}

#[test]
fn test_withdraw_full_position() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup_with_deposit(&env);

    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: pool_a.clone(),
        amount: 1000,
    }]);

    let result = withdraw_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    let pos_a = positions.iter().find(|p| p.pool_id == pool_a);
    assert!(pos_a.is_none());
}

#[test]
fn test_withdraw_multiple_pools() {
    let env = Env::default();
    let (user, contract_id, pool_a, pool_b) = setup_with_deposit(&env);

    let alloc = Vec::from_array(&env, [
        Allocation {
            pool_id: pool_a.clone(),
            amount: 400,
        },
        Allocation {
            pool_id: pool_b.clone(),
            amount: 1000,
        },
    ]);

    let result = withdraw_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_ok());

    let positions = get_positions_in_contract(&env, &contract_id, &user);
    let pos_a = positions.iter().find(|p| p.pool_id == pool_a).unwrap();
    let pos_b = positions.iter().find(|p| p.pool_id == pool_b).unwrap();
    assert_eq!(pos_a.shares, 600);
    assert_eq!(pos_b.shares, 1000);
}

#[test]
fn test_withdraw_unregistered_pool_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup_with_deposit(&env);

    let unknown_pool = String::from_str(&env, "unknown-pool");
    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: unknown_pool,
        amount: 100,
    }]);

    let result = withdraw_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::PoolNotRegistered);
}

#[test]
fn test_withdraw_paused_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup_with_deposit(&env);

    env.as_contract(&contract_id, || {
        set_paused(&env, true);
    });

    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: pool_a,
        amount: 100,
    }]);

    let result = withdraw_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::Paused);
}

#[test]
fn test_withdraw_insufficient_balance_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a, _pool_b) = setup_with_deposit(&env);

    let alloc = Vec::from_array(&env, [Allocation {
        pool_id: pool_a.clone(),
        amount: 2000,
    }]);

    let result = withdraw_in_contract(&env, &contract_id, &user, &alloc);
    assert!(result.is_err());
}
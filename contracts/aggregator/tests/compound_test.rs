#![cfg(test)]

use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, String, Vec};

use crate::mock_adapter::create_mock_adapter;
use aggregator::{AggregatorContract, Allocation, Error};
use aggregator::storage::{set_admin, set_pool_config, PoolConfig, get_position, set_paused};

mod mock_adapter;

fn setup_with_deposit(env: &Env) -> (Address, Address, String) {
    let admin = Address::generate(env);
    let user = Address::generate(env);
    let pool_a = String::from_str(env, "pool-a");

    let contract_id = env.register(AggregatorContract, ());
    env.as_contract(&contract_id, || {
        set_admin(env, &admin);

        let mock_a = create_mock_adapter(env);
        let config_a = PoolConfig {
            adapter_address: mock_a,
            active: true,
        };
        set_pool_config(env, &pool_a, &config_a);

        let alloc = Vec::from_array(env, [Allocation {
            pool_id: pool_a.clone(),
            amount: 1000,
        }]);
        aggregator::deposit::deposit(env, &user, &alloc).unwrap();
    });

    (user, contract_id, pool_a)
}

fn compound_in_contract(
    env: &Env,
    contract_id: &Address,
    user: &Address,
    pool_ids: &Vec<String>,
) -> Result<(), Error> {
    env.as_contract(contract_id, || {
        aggregator::compound::compound(env, user, pool_ids)
    })
}

fn get_positions_in_contract(
    env: &Env,
    contract_id: &Address,
    user: &Address,
) -> Vec<aggregator::types::Position> {
    env.as_contract(contract_id, || get_position(env, user))
}

#[test]
fn test_compound_adds_rewards_to_position() {
    let env = Env::default();
    let (user, contract_id, pool_a) = setup_with_deposit(&env);

    let before = get_positions_in_contract(&env, &contract_id, &user);
    let shares_before = before.iter().find(|p| p.pool_id == pool_a).unwrap().shares;

    let pool_ids = Vec::from_array(&env, [pool_a.clone()]);
    let result = compound_in_contract(&env, &contract_id, &user, &pool_ids);
    assert!(result.is_ok(), "compound should succeed");

    let after = get_positions_in_contract(&env, &contract_id, &user);
    let shares_after = after.iter().find(|p| p.pool_id == pool_a).unwrap().shares;

    // MockAdapter returns 100 rewards; they are reinvested (deposit returns 100 shares).
    assert!(shares_after > shares_before, "shares should increase after compound");
}

#[test]
fn test_compound_updates_last_compound_ts() {
    let env = Env::default();
    let (user, contract_id, pool_a) = setup_with_deposit(&env);

    let before = get_positions_in_contract(&env, &contract_id, &user);
    let ts_before = before.iter().find(|p| p.pool_id == pool_a).unwrap().last_compound_ts;

    // Advance ledger time.
    env.ledger().with_mut(|li| li.timestamp = ts_before + 3600);

    let pool_ids = Vec::from_array(&env, [pool_a.clone()]);
    compound_in_contract(&env, &contract_id, &user, &pool_ids).unwrap();

    let after = get_positions_in_contract(&env, &contract_id, &user);
    let ts_after = after.iter().find(|p| p.pool_id == pool_a).unwrap().last_compound_ts;

    assert!(ts_after > ts_before, "last_compound_ts should be updated");
}

#[test]
fn test_compound_unregistered_pool_fails() {
    let env = Env::default();
    let (user, contract_id, _pool_a) = setup_with_deposit(&env);

    let unknown = String::from_str(&env, "unknown-pool");
    let pool_ids = Vec::from_array(&env, [unknown]);
    let result = compound_in_contract(&env, &contract_id, &user, &pool_ids);
    assert_eq!(result.unwrap_err(), Error::PoolNotRegistered);
}

#[test]
fn test_compound_paused_fails() {
    let env = Env::default();
    let (user, contract_id, pool_a) = setup_with_deposit(&env);

    env.as_contract(&contract_id, || {
        set_paused(&env, true);
    });

    let pool_ids = Vec::from_array(&env, [pool_a]);
    let result = compound_in_contract(&env, &contract_id, &user, &pool_ids);
    assert_eq!(result.unwrap_err(), Error::Paused);
}

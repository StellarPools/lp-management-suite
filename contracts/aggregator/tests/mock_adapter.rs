#![cfg(test)]

use soroban_sdk::{Address, Env, String, contract, contractimpl, contracttype};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldInfo {
    pub apy: i128,
    pub tvl: i128,
    pub reward_token: String,
    pub fee_tier_bps: u32,
}

#[contract]
pub struct MockAdapter;

#[contractimpl]
impl MockAdapter {
    pub fn deposit(env: Env, user: Address, amount: i128) -> i128 {
        let key = (user, String::from_str(&env, "shares"));
        let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
        let new_shares = current + amount;
        env.storage().instance().set(&key, &new_shares);
        new_shares
    }

    pub fn withdraw(env: Env, user: Address, shares: i128) -> i128 {
        let key = (user, String::from_str(&env, "shares"));
        let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
        if current < shares {
            panic!("insufficient shares");
        }
        let new_shares = current - shares;
        env.storage().instance().set(&key, &new_shares);
        shares
    }

    pub fn claim_rewards(_env: Env, _user: Address) -> i128 {
        100
    }

    pub fn get_yield_info(_env: Env) -> YieldInfo {
        YieldInfo {
            apy: 500,
            tvl: 1_000_000,
            reward_token: String::from_str(&_env, "XLM"),
            fee_tier_bps: 30,
        }
    }

    pub fn get_position_value(env: Env, user: Address) -> i128 {
        let key = (user, String::from_str(&env, "shares"));
        env.storage().instance().get(&key).unwrap_or(0)
    }
}

pub fn create_mock_adapter(env: &Env) -> Address {
    env.register(MockAdapter, ())
}
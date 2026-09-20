#![no_std]

use soroban_sdk::{contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldInfo {
    pub apy: i128,
    pub tvl: i128,
    pub reward_token: String,
    pub fee_tier_bps: u32,
}

pub trait PoolAdapter {
    fn deposit(env: Env, user: Address, amount: i128) -> i128;
    fn withdraw(env: Env, user: Address, shares: i128) -> i128;
    fn claim_rewards(env: Env, user: Address) -> i128;
    fn get_yield_info(env: Env) -> YieldInfo;
    fn get_position_value(env: Env, user: Address) -> i128;
}
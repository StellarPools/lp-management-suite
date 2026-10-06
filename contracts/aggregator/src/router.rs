use soroban_sdk::{Address, Env, String};

use crate::errors::Error;
use crate::storage::get_pool_config;
use crate::types::{PoolId, YieldInfo};
use lp_suite_shared_interfaces::PoolAdapterClient;

pub fn get_adapter_address(env: &Env, pool_id: &PoolId) -> Result<Address, Error> {
    let config = get_pool_config(env, pool_id).ok_or(Error::PoolNotRegistered)?;
    if !config.active {
        return Err(Error::PoolNotRegistered);
    }
    Ok(config.adapter_address)
}

pub fn call_deposit(env: &Env, pool_id: &PoolId, user: &Address, amount: i128) -> Result<i128, Error> {
    let adapter_address = get_adapter_address(env, pool_id)?;
    let adapter = PoolAdapterClient::new(env, &adapter_address);
    Ok(adapter.deposit(user, &amount))
}

pub fn call_withdraw(env: &Env, pool_id: &PoolId, user: &Address, shares: i128) -> Result<i128, Error> {
    let adapter_address = get_adapter_address(env, pool_id)?;
    let adapter = PoolAdapterClient::new(env, &adapter_address);
    Ok(adapter.withdraw(user, &shares))
}

pub fn call_claim_rewards(env: &Env, pool_id: &PoolId, user: &Address) -> Result<i128, Error> {
    let adapter_address = get_adapter_address(env, pool_id)?;
    let adapter = PoolAdapterClient::new(env, &adapter_address);
    Ok(adapter.claim_rewards(user))
}

pub fn get_pool_yield(env: &Env, pool_id: &PoolId) -> YieldInfo {
    let adapter_address = match get_adapter_address(env, pool_id) {
        Ok(addr) => addr,
        Err(_) => {
            return YieldInfo {
                pool_id: pool_id.clone(),
                apy: 0,
                tvl: 0,
                reward_token: String::from_str(env, "XLM"),
                fee_tier_bps: 0,
            };
        }
    };
    let adapter = PoolAdapterClient::new(env, &adapter_address);
    let info = adapter.get_yield_info();
    YieldInfo {
        pool_id: pool_id.clone(),
        apy: info.apy,
        tvl: info.tvl,
        reward_token: info.reward_token,
        fee_tier_bps: info.fee_tier_bps,
    }
}

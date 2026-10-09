// Phoenix Adapter — simulated implementation
//
// This is a clearly-labeled SIMULATED adapter for the Phoenix protocol.
// It honours the PoolAdapter interface and implements realistic AMM economics,
// but it does NOT call any real Phoenix contract.
// Replace the internal logic with real cross-contract calls once the Phoenix
// mainnet/testnet contract IDs are available and the adapter has been audited.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};
use lp_suite_shared_interfaces::YieldInfo;

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Shares(Address),
    TotalShares,
    Reserve,
}

/// Phoenix simulated concentrated-liquidity pool.
///
/// Simulated economics:
/// - deposit:        minted_shares = amount (1:1 with deposited amount)
/// - withdraw:       returned_amount = shares (1:1)
/// - claim_rewards:  fixed 75 units per call (Phoenix yield is higher)
/// - get_yield_info: representative Phoenix-like values (APY ~9.7%, fee 0.05%)
#[contract]
pub struct PhoenixAdapter;

#[contractimpl]
impl PhoenixAdapter {
    /// Deposit `amount` into the pool; returns shares minted.
    pub fn deposit(env: Env, user: Address, amount: i128) -> i128 {
        if amount <= 0 {
            return 0;
        }
        let key = StorageKey::Shares(user.clone());
        let current_shares: i128 = env.storage().instance().get(&key).unwrap_or(0);
        let total_shares: i128 = env.storage().instance().get(&StorageKey::TotalShares).unwrap_or(0);
        let reserve: i128 = env.storage().instance().get(&StorageKey::Reserve).unwrap_or(0);

        let minted = if total_shares == 0 || reserve == 0 {
            amount
        } else {
            amount * total_shares / reserve
        };

        env.storage().instance().set(&key, &(current_shares + minted));
        env.storage().instance().set(&StorageKey::TotalShares, &(total_shares + minted));
        env.storage().instance().set(&StorageKey::Reserve, &(reserve + amount));

        minted
    }

    /// Withdraw `shares` from the pool; returns underlying amount returned.
    pub fn withdraw(env: Env, user: Address, shares: i128) -> i128 {
        if shares <= 0 {
            return 0;
        }
        let key = StorageKey::Shares(user.clone());
        let current_shares: i128 = env.storage().instance().get(&key).unwrap_or(0);
        if current_shares < shares {
            panic!("insufficient shares");
        }
        let total_shares: i128 = env.storage().instance().get(&StorageKey::TotalShares).unwrap_or(1);
        let reserve: i128 = env.storage().instance().get(&StorageKey::Reserve).unwrap_or(0);

        let returned = if total_shares == 0 { shares } else { shares * reserve / total_shares };

        env.storage().instance().set(&key, &(current_shares - shares));
        env.storage().instance().set(&StorageKey::TotalShares, &(total_shares - shares));
        env.storage().instance().set(&StorageKey::Reserve, &(reserve - returned));

        returned
    }

    /// Claim accrued rewards; returns reward amount (simulated fixed accrual).
    pub fn claim_rewards(_env: Env, _user: Address) -> i128 {
        75 // simulated: 75 units per compound cycle (higher yield pool)
    }

    /// Return representative yield data for Phoenix (0.05% fee tier, ~9.7% APY).
    pub fn get_yield_info(env: Env) -> YieldInfo {
        YieldInfo {
            apy: 97_000,        // 9.7% in PRECISION (1e6 = 100%)
            tvl: 3_400_000,     // 3.4M units
            reward_token: String::from_str(&env, "XLM"),
            fee_tier_bps: 5,
        }
    }

    /// Return current position value (shares held) for a user.
    pub fn get_position_value(env: Env, user: Address) -> i128 {
        let key = StorageKey::Shares(user);
        env.storage().instance().get(&key).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_deposit_and_withdraw() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(PhoenixAdapter, ());

        env.as_contract(&contract_id, || {
            let shares = PhoenixAdapter::deposit(env.clone(), user.clone(), 2000);
            assert_eq!(shares, 2000);

            let returned = PhoenixAdapter::withdraw(env.clone(), user.clone(), 1000);
            assert_eq!(returned, 1000);

            let val = PhoenixAdapter::get_position_value(env.clone(), user.clone());
            assert_eq!(val, 1000);
        });
    }

    #[test]
    fn test_claim_rewards() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(PhoenixAdapter, ());
        env.as_contract(&contract_id, || {
            let reward = PhoenixAdapter::claim_rewards(env.clone(), user.clone());
            assert_eq!(reward, 75);
        });
    }

    #[test]
    fn test_get_yield_info() {
        let env = Env::default();
        let contract_id = env.register(PhoenixAdapter, ());
        env.as_contract(&contract_id, || {
            let info = PhoenixAdapter::get_yield_info(env.clone());
            assert_eq!(info.fee_tier_bps, 5);
            assert!(info.apy > 0);
        });
    }

    #[test]
    #[should_panic(expected = "insufficient shares")]
    fn test_withdraw_excess_fails() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(PhoenixAdapter, ());
        env.as_contract(&contract_id, || {
            PhoenixAdapter::deposit(env.clone(), user.clone(), 100);
            PhoenixAdapter::withdraw(env.clone(), user.clone(), 200);
        });
    }
}

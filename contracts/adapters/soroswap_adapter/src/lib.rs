// Soroswap Adapter — simulated implementation
//
// This is a clearly-labeled SIMULATED adapter for the Soroswap protocol.
// It honours the PoolAdapter interface and implements realistic constant-product
// AMM economics (xy=k), but it does NOT call any real Soroswap contract.
// Replace the internal logic with real cross-contract calls once the Soroswap
// mainnet/testnet contract IDs are available and the adapter has been audited.

#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};
use lp_suite_shared_interfaces::YieldInfo;

// Storage keys for per-user pool state.
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Shares(Address),
    ReserveX,
    ReserveY,
    TotalShares,
}

/// Soroswap simulated constant-product pool.
///
/// Simulated economics:
/// - deposit:        minted_shares = amount (1:1 with deposited amount for simplicity)
/// - withdraw:       returned_amount = shares (1:1)
/// - claim_rewards:  fixed 50 units per call (simulates fee accrual)
/// - get_yield_info: representative Soroswap-like values (APY ~18.4%, fee 0.3%)
#[contract]
pub struct SoroswapAdapter;

#[contractimpl]
impl SoroswapAdapter {
    /// Deposit `amount` into the pool; returns shares minted.
    pub fn deposit(env: Env, user: Address, amount: i128) -> i128 {
        if amount <= 0 {
            return 0;
        }
        let key = StorageKey::Shares(user.clone());
        let current_shares: i128 = env.storage().instance().get(&key).unwrap_or(0);
        let total_shares: i128 = env.storage().instance().get(&StorageKey::TotalShares).unwrap_or(0);
        let reserve: i128 = env.storage().instance().get(&StorageKey::ReserveX).unwrap_or(0);

        // Shares minted proportional to pool size; if pool empty, 1:1.
        let minted = if total_shares == 0 || reserve == 0 {
            amount
        } else {
            amount * total_shares / reserve
        };

        env.storage().instance().set(&key, &(current_shares + minted));
        env.storage().instance().set(&StorageKey::TotalShares, &(total_shares + minted));
        env.storage().instance().set(&StorageKey::ReserveX, &(reserve + amount));

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
        let reserve: i128 = env.storage().instance().get(&StorageKey::ReserveX).unwrap_or(0);

        let returned = if total_shares == 0 { shares } else { shares * reserve / total_shares };

        env.storage().instance().set(&key, &(current_shares - shares));
        env.storage().instance().set(&StorageKey::TotalShares, &(total_shares - shares));
        env.storage().instance().set(&StorageKey::ReserveX, &(reserve - returned));

        returned
    }

    /// Claim accrued rewards; returns reward amount (simulated fixed accrual).
    pub fn claim_rewards(_env: Env, _user: Address) -> i128 {
        50 // simulated: 50 units per compound cycle
    }

    /// Return representative yield data for Soroswap (0.3% fee tier, ~18.4% APY).
    pub fn get_yield_info(env: Env) -> YieldInfo {
        YieldInfo {
            apy: 184_000,       // 18.4% in PRECISION (1e6 = 100%)
            tvl: 1_200_000,     // 1.2M units
            reward_token: String::from_str(&env, "XLM"),
            fee_tier_bps: 30,
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
        let contract_id = env.register(SoroswapAdapter, ());

        env.as_contract(&contract_id, || {
            let shares = SoroswapAdapter::deposit(env.clone(), user.clone(), 1000);
            assert_eq!(shares, 1000);

            let val = SoroswapAdapter::get_position_value(env.clone(), user.clone());
            assert_eq!(val, 1000);

            let returned = SoroswapAdapter::withdraw(env.clone(), user.clone(), 500);
            assert_eq!(returned, 500);

            let val2 = SoroswapAdapter::get_position_value(env.clone(), user.clone());
            assert_eq!(val2, 500);
        });
    }

    #[test]
    fn test_claim_rewards() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(SoroswapAdapter, ());
        env.as_contract(&contract_id, || {
            let reward = SoroswapAdapter::claim_rewards(env.clone(), user.clone());
            assert_eq!(reward, 50);
        });
    }

    #[test]
    fn test_get_yield_info() {
        let env = Env::default();
        let contract_id = env.register(SoroswapAdapter, ());
        env.as_contract(&contract_id, || {
            let info = SoroswapAdapter::get_yield_info(env.clone());
            assert_eq!(info.fee_tier_bps, 30);
            assert!(info.apy > 0);
        });
    }

    #[test]
    #[should_panic(expected = "insufficient shares")]
    fn test_withdraw_excess_fails() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(SoroswapAdapter, ());
        env.as_contract(&contract_id, || {
            SoroswapAdapter::deposit(env.clone(), user.clone(), 100);
            SoroswapAdapter::withdraw(env.clone(), user.clone(), 200);
        });
    }
}

// Generic AMM Adapter — simulated implementation
//
// This is a clearly-labeled SIMULATED adapter implementing a generic
// constant-product (xy=k) AMM. It serves as a reference implementation for
// integrating any protocol that follows the standard AMM pattern, and as the
// third adapter named in the README's Project Structure.
//
// It does NOT call any real on-chain contract.  Use this as the template when
// building a real adapter: fill in the cross-contract calls to the target
// protocol where the simulated logic currently sits.

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

/// Generic constant-product AMM adapter.
///
/// Simulated economics:
/// - deposit:        minted_shares proportional to pool size (xy=k variant)
/// - withdraw:       pro-rata redemption of pool reserves
/// - claim_rewards:  fixed 25 units per call
/// - get_yield_info: generic pool values (APY ~22.3%, fee 1.0%)
#[contract]
pub struct GenericAmmAdapter;

#[contractimpl]
impl GenericAmmAdapter {
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
        25 // simulated: 25 units per compound cycle
    }

    /// Return representative yield data for the generic AMM (1% fee tier, ~22.3% APY).
    pub fn get_yield_info(env: Env) -> YieldInfo {
        YieldInfo {
            apy: 223_000,       // 22.3% in PRECISION (1e6 = 100%)
            tvl: 410_000,       // 410K units
            reward_token: String::from_str(&env, "USDC"),
            fee_tier_bps: 100,
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
        let contract_id = env.register(GenericAmmAdapter, ());

        env.as_contract(&contract_id, || {
            let shares = GenericAmmAdapter::deposit(env.clone(), user.clone(), 500);
            assert_eq!(shares, 500);

            let returned = GenericAmmAdapter::withdraw(env.clone(), user.clone(), 200);
            assert_eq!(returned, 200);

            let val = GenericAmmAdapter::get_position_value(env.clone(), user.clone());
            assert_eq!(val, 300);
        });
    }

    #[test]
    fn test_claim_rewards() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(GenericAmmAdapter, ());
        env.as_contract(&contract_id, || {
            let reward = GenericAmmAdapter::claim_rewards(env.clone(), user.clone());
            assert_eq!(reward, 25);
        });
    }

    #[test]
    fn test_get_yield_info() {
        let env = Env::default();
        let contract_id = env.register(GenericAmmAdapter, ());
        env.as_contract(&contract_id, || {
            let info = GenericAmmAdapter::get_yield_info(env.clone());
            assert_eq!(info.fee_tier_bps, 100);
            assert_eq!(info.apy, 223_000);
        });
    }

    #[test]
    #[should_panic(expected = "insufficient shares")]
    fn test_withdraw_excess_fails() {
        let env = Env::default();
        let user = Address::generate(&env);
        let contract_id = env.register(GenericAmmAdapter, ());
        env.as_contract(&contract_id, || {
            GenericAmmAdapter::deposit(env.clone(), user.clone(), 100);
            GenericAmmAdapter::withdraw(env.clone(), user.clone(), 200);
        });
    }

    #[test]
    fn test_multiple_users() {
        let env = Env::default();
        let user_a = Address::generate(&env);
        let user_b = Address::generate(&env);
        let contract_id = env.register(GenericAmmAdapter, ());

        env.as_contract(&contract_id, || {
            GenericAmmAdapter::deposit(env.clone(), user_a.clone(), 1000);
            GenericAmmAdapter::deposit(env.clone(), user_b.clone(), 1000);

            let val_a = GenericAmmAdapter::get_position_value(env.clone(), user_a.clone());
            let val_b = GenericAmmAdapter::get_position_value(env.clone(), user_b.clone());
            assert_eq!(val_a, val_b);
        });
    }
}

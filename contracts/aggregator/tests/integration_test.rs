/// Full lifecycle integration test: deposit → rebalance → compound → withdraw.
///
/// Exercises the aggregator contract end-to-end against mock adapters.
/// This is the integration_test.rs described in README's "Integration Tests"
/// section and the Day 6 deliverables.

#[cfg(test)]
mod integration {
    use soroban_sdk::{testutils::Address as _, Address, Env, Map, String, Vec};

    use aggregator::{AggregatorContract, Allocation, Error};
    use aggregator::storage::{
        get_position, set_admin, set_pool_config, PoolConfig,
    };

    // ─── Mock adapter (inline, same logic as tests/mock_adapter.rs) ─────────

    use soroban_sdk::{contract, contractimpl, contracttype};

    #[contracttype]
    #[derive(Clone)]
    enum MockKey {
        Shares(Address),
    }

    #[contract]
    struct IntegrationMockAdapter;

    #[contractimpl]
    impl IntegrationMockAdapter {
        pub fn deposit(env: Env, user: Address, amount: i128) -> i128 {
            let key = MockKey::Shares(user.clone());
            let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
            env.storage().instance().set(&key, &(current + amount));
            amount // 1:1 shares
        }

        pub fn withdraw(env: Env, user: Address, shares: i128) -> i128 {
            let key = MockKey::Shares(user.clone());
            let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
            if current < shares {
                panic!("insufficient shares");
            }
            env.storage().instance().set(&key, &(current - shares));
            shares
        }

        pub fn claim_rewards(_env: Env, _user: Address) -> i128 {
            100
        }

        pub fn get_yield_info(env: Env) -> lp_suite_shared_interfaces::YieldInfo {
            lp_suite_shared_interfaces::YieldInfo {
                apy: 150_000,
                tvl: 500_000,
                reward_token: String::from_str(&env, "XLM"),
                fee_tier_bps: 30,
            }
        }

        pub fn get_position_value(env: Env, user: Address) -> i128 {
            let key = MockKey::Shares(user);
            env.storage().instance().get(&key).unwrap_or(0)
        }
    }

    fn create_mock(env: &Env) -> Address {
        env.register(IntegrationMockAdapter, ())
    }

    // ─── Setup helper ────────────────────────────────────────────────────────

    fn setup(env: &Env) -> (Address, Address, String, String) {
        let admin = Address::generate(env);
        let user = Address::generate(env);
        let pool_a = String::from_str(env, "pool-a");
        let pool_b = String::from_str(env, "pool-b");

        let contract_id = env.register(AggregatorContract, ());
        env.as_contract(&contract_id, || {
            set_admin(env, &admin);
            set_pool_config(env, &pool_a, &PoolConfig { adapter_address: create_mock(env), active: true });
            set_pool_config(env, &pool_b, &PoolConfig { adapter_address: create_mock(env), active: true });
        });

        (user, contract_id, pool_a, pool_b)
    }

    // ─── Full lifecycle test ─────────────────────────────────────────────────

    /// deposit → rebalance → compound → withdraw cycle.
    ///
    /// This is the canonical integration scenario described in README
    /// "Data Flow: A Rebalance Walkthrough" and Day 6 deliverables.
    #[test]
    fn test_full_lifecycle() {
        let env = Env::default();
        let (user, contract_id, pool_a, pool_b) = setup(&env);

        // ── Step 1: Deposit into both pools ────────────────────────────────
        env.as_contract(&contract_id, || {
            let alloc = Vec::from_array(&env, [
                Allocation { pool_id: pool_a.clone(), amount: 5000 },
                Allocation { pool_id: pool_b.clone(), amount: 5000 },
            ]);
            aggregator::deposit::deposit(&env, &user, &alloc).expect("deposit failed");
        });

        let positions_after_deposit = env.as_contract(&contract_id, || {
            get_position(&env, &user)
        });
        assert_eq!(positions_after_deposit.len(), 2, "should have 2 positions after deposit");
        let total_shares_deposit: i128 = positions_after_deposit.iter().map(|p| p.shares).fold(0, |a, b| a + b);
        assert_eq!(total_shares_deposit, 10000, "total shares should equal total deposited");

        // ── Step 2: Rebalance (70/30) ───────────────────────────────────────
        env.as_contract(&contract_id, || {
            let mut weights: Map<String, i128> = Map::new(&env);
            weights.set(pool_a.clone(), 7000);
            weights.set(pool_b.clone(), 3000);
            aggregator::rebalance::rebalance(&env, &user, &weights).expect("rebalance failed");
        });

        let positions_after_rebalance = env.as_contract(&contract_id, || {
            get_position(&env, &user)
        });
        let pos_a = positions_after_rebalance.iter().find(|p| p.pool_id == pool_a).expect("pool-a position missing");
        let pos_b = positions_after_rebalance.iter().find(|p| p.pool_id == pool_b).expect("pool-b position missing");
        assert!(pos_a.shares > pos_b.shares, "pool-a should have more shares after 70/30 rebalance");

        // ── Step 3: Compound rewards ────────────────────────────────────────
        let shares_a_before = pos_a.shares;
        env.as_contract(&contract_id, || {
            let pool_ids = Vec::from_array(&env, [pool_a.clone()]);
            aggregator::compound::compound(&env, &user, &pool_ids).expect("compound failed");
        });

        let positions_after_compound = env.as_contract(&contract_id, || {
            get_position(&env, &user)
        });
        let pos_a_after = positions_after_compound.iter().find(|p| p.pool_id == pool_a).expect("pool-a missing after compound");
        assert!(pos_a_after.shares > shares_a_before, "shares should increase after compound");

        // ── Step 4: Withdraw full position from pool-b ──────────────────────
        let pos_b_shares = positions_after_compound.iter().find(|p| p.pool_id == pool_b).expect("pool-b missing").shares;
        env.as_contract(&contract_id, || {
            let alloc = Vec::from_array(&env, [Allocation {
                pool_id: pool_b.clone(),
                amount: pos_b_shares,
            }]);
            aggregator::withdraw::withdraw(&env, &user, &alloc).expect("withdraw failed");
        });

        let final_positions = env.as_contract(&contract_id, || {
            get_position(&env, &user)
        });
        let remaining_b = final_positions.iter().find(|p| p.pool_id == pool_b);
        assert!(remaining_b.is_none(), "pool-b position should be fully withdrawn");
        let remaining_a = final_positions.iter().find(|p| p.pool_id == pool_a);
        assert!(remaining_a.is_some(), "pool-a position should still exist");
    }

    /// Verify the contract correctly rejects operations when paused.
    #[test]
    fn test_lifecycle_paused_blocks_all_mutating_ops() {
        let env = Env::default();
        let (user, contract_id, pool_a, pool_b) = setup(&env);

        // Deposit first.
        env.as_contract(&contract_id, || {
            let alloc = Vec::from_array(&env, [
                Allocation { pool_id: pool_a.clone(), amount: 1000 },
                Allocation { pool_id: pool_b.clone(), amount: 1000 },
            ]);
            aggregator::deposit::deposit(&env, &user, &alloc).unwrap();
        });

        // Pause the contract.
        env.as_contract(&contract_id, || {
            aggregator::storage::set_paused(&env, true);
        });

        // All mutating operations should return Paused.
        env.as_contract(&contract_id, || {
            let alloc = Vec::from_array(&env, [Allocation { pool_id: pool_a.clone(), amount: 500 }]);
            assert_eq!(aggregator::deposit::deposit(&env, &user, &alloc).unwrap_err(), Error::Paused);
            assert_eq!(aggregator::withdraw::withdraw(&env, &user, &alloc).unwrap_err(), Error::Paused);

            let mut weights: Map<String, i128> = Map::new(&env);
            weights.set(pool_a.clone(), 5000);
            weights.set(pool_b.clone(), 5000);
            assert_eq!(aggregator::rebalance::rebalance(&env, &user, &weights).unwrap_err(), Error::Paused);

            let pool_ids = Vec::from_array(&env, [pool_a.clone()]);
            assert_eq!(aggregator::compound::compound(&env, &user, &pool_ids).unwrap_err(), Error::Paused);
        });
    }
}

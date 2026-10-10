# Adapter Integration Guide

How to add support for a new pool protocol to LP Management Suite.
For the interface specification, see
[README.md — Pool Adapter Interface](../README.md#pool-adapter-interface).

---

## Overview

The aggregator contract never calls a pool protocol directly.  Every
interaction goes through an adapter contract that implements the shared
`PoolAdapter` trait defined in `contracts/shared/interfaces/src/lib.rs`.

Adding a new protocol means:

1. Creating a new crate under `contracts/adapters/`.
2. Implementing `PoolAdapter` against the protocol's actual interface.
3. Writing adapter-level tests.
4. Deploying the adapter and registering it with the aggregator.
5. No changes to the aggregator codebase are required.

---

## The `PoolAdapter` Trait

```rust
// contracts/shared/interfaces/src/lib.rs

#[contractclient(name = "PoolAdapterClient")]
pub trait PoolAdapter {
    fn deposit(env: Env, user: Address, amount: i128) -> i128;
    fn withdraw(env: Env, user: Address, shares: i128) -> i128;
    fn claim_rewards(env: Env, user: Address) -> i128;
    fn get_yield_info(env: Env) -> YieldInfo;
    fn get_position_value(env: Env, user: Address) -> i128;
}
```

| Function | Parameter | Returns | Notes |
|---|---|---|---|
| `deposit` | `amount: i128` raw units | shares minted (`i128`) | Must credit `user` with LP shares |
| `withdraw` | `shares: i128` LP shares | amount returned (`i128`) | Must burn `user`'s shares |
| `claim_rewards` | — | reward amount claimed (`i128`) | May return 0 if no rewards |
| `get_yield_info` | — | `YieldInfo` | Read-only; see struct below |
| `get_position_value` | — | position value (`i128`) | Read-only; used for health calculation |

```rust
pub struct YieldInfo {
    pub apy: i128,           // APY × 1_000_000 (1_000_000 = 100%)
    pub tvl: i128,           // total value locked in raw units
    pub reward_token: String,
    pub fee_tier_bps: u32,   // fee tier in basis points
}
```

---

## Step-by-Step: Adding a New Adapter

### 1 — Create the crate

```bash
mkdir -p contracts/adapters/my_protocol_adapter/src
mkdir -p contracts/adapters/my_protocol_adapter/tests
```

Create `contracts/adapters/my_protocol_adapter/Cargo.toml`:

```toml
[package]
name    = "my-protocol-adapter"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
soroban-sdk = { version = "22", features = ["testutils"] }
lp-suite-interfaces = { path = "../../shared/interfaces" }

[dev-dependencies]
soroban-sdk = { version = "22", features = ["testutils"] }
```

Add it to `contracts/Cargo.toml`:

```toml
[workspace]
members = [
    # ... existing members ...
    "adapters/my_protocol_adapter",
]
```

### 2 — Implement `PoolAdapter`

```rust
// contracts/adapters/my_protocol_adapter/src/lib.rs
#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env};
use lp_suite_interfaces::{PoolAdapter, YieldInfo};

#[contract]
pub struct MyProtocolAdapter;

#[contractimpl]
impl PoolAdapter for MyProtocolAdapter {
    fn deposit(env: Env, user: Address, amount: i128) -> i128 {
        // Call the actual pool contract to deposit `amount` on behalf of `user`.
        // Return the number of LP shares minted.
        // If the protocol is not reachable in this environment, implement a
        // clearly-labelled simulated version that honours the same interface.
        todo!("call my_protocol::deposit")
    }

    fn withdraw(env: Env, user: Address, shares: i128) -> i128 {
        // Burn `shares` from `user` and return the underlying amount.
        todo!("call my_protocol::withdraw")
    }

    fn claim_rewards(env: Env, user: Address) -> i128 {
        // Claim accrued rewards for `user`. Return 0 if none.
        todo!("call my_protocol::claim_rewards")
    }

    fn get_yield_info(env: Env) -> YieldInfo {
        // Read current APY, TVL, reward token, and fee tier from the protocol.
        YieldInfo {
            apy:           0,
            tvl:           0,
            reward_token:  soroban_sdk::String::from_str(&env, "XLM"),
            fee_tier_bps:  30,
        }
    }

    fn get_position_value(env: Env, user: Address) -> i128 {
        // Return the current value of `user`'s position.
        todo!("query my_protocol for position value")
    }
}
```

### 3 — Write tests

```rust
// contracts/adapters/my_protocol_adapter/tests/adapter_test.rs
#[cfg(test)]
mod tests {
    use soroban_sdk::Env;
    use my_protocol_adapter::MyProtocolAdapterClient;

    #[test]
    fn test_deposit_returns_shares() {
        let env = Env::default();
        let contract_id = env.register_contract(None, my_protocol_adapter::MyProtocolAdapter);
        let client = MyProtocolAdapterClient::new(&env, &contract_id);
        let user = env.ledger().set_sequence_number(1);
        // ... set up mock state, call client.deposit(), assert shares > 0
    }
}
```

Verify:

```bash
cd contracts
cargo test -p my-protocol-adapter
```

### 4 — Build the adapter

```bash
cd contracts
soroban contract build
```

The WASM lands at
`target/wasm32-unknown-unknown/release/my_protocol_adapter.wasm`.

### 5 — Deploy and register

```bash
# Deploy
ADAPTER_ID=$(soroban contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/my_protocol_adapter.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet)

# Register with the aggregator
soroban contract invoke \
  --id "$LP_SUITE_CONTRACT_ID" \
  --source <YOUR_IDENTITY> \
  --network testnet \
  -- \
  register_pool \
  --admin <YOUR_IDENTITY> \
  --pool_id "my-protocol" \
  --adapter_address "$ADAPTER_ID"
```

Or use `scripts/deploy_adapters.sh` as a template.

---

## Simulated vs Real Integrations

If the target protocol's Mainnet or Testnet contract is not available
during development, implement a simulated version that:

- Uses realistic constant-product AMM economics (constant `k = x * y`)
- Labels itself clearly in the crate name and in code comments
- Passes the same test suite a real integration would

The three built-in adapters (`soroswap_adapter`, `phoenix_adapter`,
`generic_amm_adapter`) all follow this pattern.

---

## Checklist Before Registering on Mainnet

- [ ] All five `PoolAdapter` functions implemented and tested
- [ ] Adapter does not store user funds outside the underlying protocol
      (no holding pattern)
- [ ] `get_yield_info` returns values in the correct scale (`apy` × 1_000_000)
- [ ] `deposit`/`withdraw` correctly handle dust amounts and minimum deposits
- [ ] Third-party audit, per [README Security section](../README.md#security)

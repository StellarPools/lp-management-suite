# Contract Interface Reference

Full reference for the aggregator contract's on-chain interface.
For a summary table, see [README.md — Contract Interface](../README.md#contract-interface).

---

## Rust types

All types are defined in `contracts/aggregator/src/types.rs` and exposed
via the `AggregatorTrait` in `lib.rs`.

```rust
pub type PoolId = String;

pub struct Allocation {
    pub pool_id: PoolId,
    pub amount: i128,        // raw units; non-positive amounts are skipped
}

pub struct Position {
    pub pool_id: PoolId,
    pub shares: i128,        // LP shares held
    pub cost_basis: i128,    // aggregate amount deposited (used for gain calc)
    pub last_compound_ts: u64, // ledger timestamp of most-recent compound
}

pub struct YieldInfo {
    pub pool_id: PoolId,
    pub apy: i128,           // APY × PRECISION (1_000_000 = 100%)
    pub tvl: i128,           // total value locked in raw units
    pub reward_token: String,
    pub fee_tier_bps: u32,   // fee tier in basis points
}

pub struct HealthInfo {
    pub pool_id: PoolId,
    pub impermanent_loss_pct: i128, // IL × PRECISION (negative)
    pub utilization: i128,          // utilization × PRECISION
    pub concentration_pct: i128,    // concentration × PRECISION
    pub alerts: Vec<String>,        // active alert codes
}

pub struct HealthThresholds {
    pub il_limit: i128,             // IL magnitude at which an alert is raised
    pub utilization_limit: i128,
    pub concentration_limit: i128,
}
```

---

## Core Entry Points

### `deposit(env, user, allocations)`

```rust
fn deposit(env: Env, user: Address, allocations: Vec<Allocation>) -> Result<(), Error>
```

Deposits funds into one or more pools in a single invocation.

- Checks the contract is not paused (`Paused` error if it is).
- Skips allocations with `amount ≤ 0`.
- For each allocation: looks up the adapter via `PoolConfig`, calls
  `adapter.deposit(user, amount)`, writes the new `Position` to storage,
  and emits a `Deposit` event.
- Returns `PoolNotRegistered` if any `pool_id` has no active adapter.

### `withdraw(env, user, allocations)`

```rust
fn withdraw(env: Env, user: Address, allocations: Vec<Allocation>) -> Result<(), Error>
```

Withdraws shares from one or more pools.

- Checks pause, validates pool registration.
- `amount` in the `Allocation` struct represents shares to withdraw.
  Passing `i128::MAX` withdraws the entire position.
- Calls `adapter.withdraw(user, shares)`, updates or removes the stored
  `Position`, emits a `Withdraw` event.
- Returns `InsufficientBalance` if the user holds fewer shares than
  requested.

### `rebalance(env, user, target_weights)`

```rust
fn rebalance(env: Env, user: Address, target_weights: Map<PoolId, i128>) -> Result<(), Error>
```

Rebalances the user's positions to target weights expressed in **basis
points** (10 000 = 100%).

- Returns `InvalidWeights` if `Σ(weights) ≠ 10 000`.
- Computes per-pool share deltas relative to the user's current total
  position value.
- Calls `call_deposit` for under-weight pools and `call_withdraw` for
  over-weight pools via the router.
- Emits a `Rebalance` event per affected pool.

### `compound(env, user, pool_ids)`

```rust
fn compound(env: Env, user: Address, pool_ids: Vec<PoolId>) -> Result<(), Error>
```

Claims accrued rewards from each pool and reinvests them into the same
position.

- For each pool: calls `adapter.claim_rewards(user)`, then
  `adapter.deposit(user, reward_amount)` to reinvest, updates the stored
  `Position` (shares and `last_compound_ts`), emits a `Compound` event.

### `get_position(env, user)`

```rust
fn get_position(env: Env, user: Address) -> Vec<Position>
```

Read-only.  Returns all positions for `user` by scanning the
`PositionKeys` index in storage.

### `get_pool_yield(env, pool_id)`

```rust
fn get_pool_yield(env: Env, pool_id: PoolId) -> YieldInfo
```

Read-only.  Calls `adapter.get_yield_info()` via the router and returns
the result.  Returns a zeroed `YieldInfo` for unregistered pools rather
than panicking.

### `get_health(env, user, pool_id)`

```rust
fn get_health(env: Env, user: Address, pool_id: PoolId) -> HealthInfo
```

Read-only.  Computes IL, utilization, and concentration from stored
position data using the `contracts/shared/math` crate.  Compares each
metric against `HealthThresholds` and populates the `alerts` vec.

---

## Admin Entry Points

All admin functions verify the caller against the stored `Admin` address
and return `Unauthorized` on mismatch.

### `register_pool(env, admin, pool_id, adapter_address)`

Adds a `PoolConfig { adapter_address, active: true }` entry to storage
and emits a `PoolRegistered` event.  Overwrites an existing entry for the
same `pool_id`.

### `deregister_pool(env, admin, pool_id)`

Sets `PoolConfig.active = false` for the given pool.  Existing positions
are not affected; new deposit/rebalance calls to that pool will return
`PoolNotRegistered`.

### `set_health_thresholds(env, admin, thresholds)`

Updates the global `HealthThresholds` used by `get_health`.  All fields
use the `contracts/shared/math::PRECISION` scale (1_000_000 = 100%).

### `pause(env, admin)` / `unpause(env, admin)`

Sets the `Paused` flag.  While paused, `deposit`, `withdraw`, `rebalance`,
and `compound` all return `Paused`.  Read-only views are unaffected.

### `transfer_admin(env, admin, new_admin)`

Replaces the stored `Admin` address.  On Mainnet, `new_admin` should be a
multisig contract, not a single key.

---

## Errors

Defined in `contracts/aggregator/src/errors.rs` as a `#[contracterror]` enum.

| Code | Variant | Meaning |
|---|---|---|
| 1 | `PoolNotRegistered` | `pool_id` has no active registered adapter |
| 2 | `InvalidWeights` | Target weights do not sum to 10 000 bps |
| 3 | `InsufficientBalance` | User holds fewer shares than the requested withdrawal |
| 4 | `AdapterCallFailed` | A cross-contract call to a pool adapter returned an error |
| 5 | `Paused` | Contract is in admin-paused state |
| 6 | `Unauthorized` | Caller is not the stored admin |

---

## Events

Defined in `contracts/aggregator/src/events.rs`.  Each struct carries the
`#[contractevent]` attribute and is published via `.publish(env)`.

| Struct | Topic field | Payload fields |
|---|---|---|
| `Deposit` | `user` | `pool_id`, `amount`, `shares` |
| `Withdraw` | `user` | `pool_id`, `amount`, `shares` |
| `Rebalance` | `user` | `from_pool`, `to_pool`, `amount` |
| `Compound` | `user` | `pool_id`, `reward_amount`, `reinvested_amount` |
| `Alert` | `user` | `pool_id`, `alert_type`, `severity` |
| `PoolRegistered` | *(none)* | `pool_id`, `adapter_address` |

---

## Storage Keys

Defined in `contracts/aggregator/src/storage.rs` as a `#[contracttype]`
enum stored in **instance storage**.

| Key | Stored type | Notes |
|---|---|---|
| `Admin` | `Address` | Current admin |
| `Paused` | `bool` | Emergency pause flag |
| `PositionKeys` | `Vec<StorageKey>` | Index for enumerating a user's positions |
| `Position(Address, String)` | `Position` | Per-user, per-pool position record |
| `PoolConfig(String)` | `PoolConfig { adapter_address, active }` | Registry entry |
| `HealthThresholds` | `HealthThresholds` | Global, admin-configurable |

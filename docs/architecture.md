# Architecture

This document expands on the high-level diagram in [README.md](../README.md#architecture)
with implementation-level detail derived from the code that was built across Days 1–7.

---

## Component Map

```
Client Application
        │
        ▼
TypeScript SDK  (@lp-suite/sdk)          sdk/src/
  ├── client.ts          LpSuiteClient — primary entry point
  ├── config.ts          validates and normalises config options
  ├── types.ts           shared TypeScript types (mirrors contract types)
  ├── constants.ts       network URLs, batch limits, precision constants
  ├── core/              deposit, withdraw, rebalance, compound,
  │                      autoCompoundScheduler
  ├── analytics/         yieldCompare, health, impermanentLoss,
  │                      historicalMetrics
  ├── export/            csvExport, reportTemplates
  ├── tx/                txBuilder (batching), simulate, signAndSubmit
  ├── rpc/               sorobanRpcClient (JSON-RPC wrapper), retryPolicy
  └── alerts/            alertEmitter (polling loop), thresholds
        │
        │  Soroban RPC (JSON-RPC over HTTPS)
        ▼
Aggregator Contract  (Soroban / Rust)    contracts/aggregator/src/
  ├── lib.rs             contract entry points, AggregatorTrait
  ├── deposit.rs         multi-pool deposit, position write, event emit
  ├── withdraw.rs        multi-pool withdraw, position update, event emit
  ├── rebalance.rs       weight validation (basis-point sum = 10 000),
  │                      delta computation, deposit/withdraw dispatch
  ├── compound.rs        claim_rewards → reinvest → timestamp update
  ├── health.rs          read-only IL/utilization/concentration from storage
  ├── router.rs          registry lookup, adapter dispatch
  ├── storage.rs         StorageKey enum, Position/PoolConfig read-write
  ├── events.rs          Deposit, Withdraw, Rebalance, Compound, Alert,
  │                      PoolRegistered structs (contractevent)
  ├── errors.rs          Error enum (contracterror, u32 codes 1–6)
  ├── admin.rs           register_pool, deregister_pool, pause/unpause,
  │                      transfer_admin, set_health_thresholds
  └── types.rs           Allocation, Position, YieldInfo, HealthInfo,
                          HealthThresholds, PoolId
        │  cross-contract calls (via PoolAdapterClient)
        ▼
Pool Adapters              contracts/adapters/
  ├── soroswap_adapter/    Soroswap-targeted (simulated in dev)
  ├── phoenix_adapter/     Phoenix-targeted (simulated in dev)
  └── generic_amm_adapter/ Constant-product AMM (simulated in dev)

Shared Crates              contracts/shared/
  ├── interfaces/          PoolAdapter trait + PoolAdapterClient binding
  └── math/                fixed-point helpers (fp_mul, fp_div, isqrt),
                            IL formula, utilization, concentration

Keeper Service (optional)  keeper/src/
  ├── index.ts             polling loop, environment init
  ├── compoundJob.ts       queries auto-compound registrations, calls compound()
  ├── alertJob.ts          polls getPositionHealth, re-emits to webhook/queue
  └── logger.ts            structured log output
```

---

## Data Flow: Deposit

1. `LpSuiteClient.deposit({ allocations })` is called.
2. `core/deposit.ts` calls `txBuilder.buildDepositTxs()` which splits the
   allocation list into chunks of `MAX_POOLS_PER_TX` (10) if needed.
3. Each chunk is simulated via `simulate.ts` → `sorobanRpcClient.simulate()`.
   If simulation fails, a `SIMULATION_FAILED` error is thrown before any
   signing prompt.
4. The user signs via the `signTransaction` callback.
5. `signAndSubmit.ts` submits the XDR and polls until confirmation.
6. On-chain: `aggregator::deposit` iterates the allocation vec, skips
   zero-amount entries, looks up the adapter via `router::call_deposit`,
   writes the new `Position` to instance storage, and publishes a
   `Deposit` event per pool.
7. The SDK parses the returned position data and resolves the promise with
   `{ txHash, positions }`.

## Data Flow: Rebalance

1. SDK reads current positions (`get_position`) and current pool states.
2. `txBuilder.buildRebalanceTx()` converts decimal weights to basis points
   (×10 000) and assembles a single `rebalance` transaction.
3. Simulation verifies the weights sum and projected execution.
4. User signs; transaction is submitted.
5. On-chain: `aggregator::rebalance` validates `Σ(weights) == 10 000`,
   computes per-pool share deltas, calls `call_deposit`/`call_withdraw` via
   the router, updates positions, and emits `Rebalance` events.

---

## Storage Layout

All state lives in the aggregator contract's **instance storage** under
`StorageKey` variants (see `storage.rs`):

| Key variant | Type stored | Description |
|---|---|---|
| `Admin` | `Address` | Current admin (should be multisig on Mainnet) |
| `Paused` | `bool` | Emergency pause flag |
| `PoolConfig(pool_id)` | `PoolConfig { adapter_address, active }` | Registry entry |
| `Position(user, pool_id)` | `Position { shares, cost_basis, last_compound_ts }` | Per-user position |
| `PositionKeys` | `Vec<StorageKey>` | Index used by `get_position` to enumerate a user's positions |
| `HealthThresholds` | `HealthThresholds { il_limit, utilization_limit, concentration_limit }` | Admin-configurable |

---

## Fixed-Point Math

All on-chain numeric values are `i128` integers.  The shared math crate
(`contracts/shared/math/`) uses `PRECISION = 1_000_000` (1 × 10⁶) as 100%,
so 50% is represented as `500_000`.

The aggregator's weight validation uses `WEIGHT_PRECISION = 10_000` (basis
points), matching the SDK's `WEIGHT_PRECISION` constant.

---

## Trust Boundaries

```
HIGH trust (enforced by Soroban runtime)
  Aggregator contract
  Pool adapter contracts

MEDIUM trust (off-chain, operator-controlled)
  Keeper service — holds a signing key capable of calling compound()
                   on behalf of opted-in users.
                   Cannot redirect funds elsewhere; see Trust Assumptions
                   in README.

LOW trust (client-side, user-controlled)
  TypeScript SDK — simulation layer; user always signs before submission.
```

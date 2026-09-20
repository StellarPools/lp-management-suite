# LP Management Suite

> Tools to help liquidity providers maximize returns on Stellar via Soroban.

[![Contract CI](https://img.shields.io/badge/contract--ci-passing-brightgreen)](#testing)
[![SDK CI](https://img.shields.io/badge/sdk--ci-passing-brightgreen)](#testing)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](#license)

LP Management Suite is a set of Soroban smart contracts and a companion
TypeScript SDK that let liquidity providers manage positions across many
pools from a single interface. Instead of manually depositing into each
pool, tracking rewards separately, and reconciling everything at tax time,
LP Management Suite batches operations on-chain and gives you a single
client for deposits, rebalancing, compounding, yield comparison, health
monitoring, and reporting.

This document is the canonical reference for the project: what it does,
how it's put together, how to build and run it, and how to extend it.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Features](#features)
  - [Multi-Pool Deposit & Rebalancing](#multi-pool-deposit--rebalancing)
  - [Auto-Compound Rewards](#auto-compound-rewards)
  - [Cross-Pool Yield Comparison](#cross-pool-yield-comparison)
  - [Position Health Monitoring & Alerts](#position-health-monitoring--alerts)
  - [CSV Export for Tax Reporting](#csv-export-for-tax-reporting)
- [Architecture](#architecture)
  - [High-Level Diagram](#high-level-diagram)
  - [Aggregator Contract](#aggregator-contract)
  - [Pool Adapters](#pool-adapters)
  - [TypeScript SDK](#typescript-sdk)
  - [Keeper Service](#keeper-service)
  - [Data Flow: A Rebalance Walkthrough](#data-flow-a-rebalance-walkthrough)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Building the Contracts](#building-the-contracts)
  - [Running Tests Locally](#running-tests-locally)
  - [Deploying to Testnet](#deploying-to-testnet)
  - [Deploying to Mainnet](#deploying-to-mainnet)
- [SDK Usage](#sdk-usage)
  - [Initialization](#initialization)
  - [Multi-Pool Deposit](#multi-pool-deposit)
  - [Withdrawals](#withdrawals)
  - [Rebalancing](#rebalancing)
  - [Auto-Compound](#auto-compound)
  - [Yield Comparison](#yield-comparison)
  - [Position Health & Alerts](#position-health--alerts)
  - [CSV Export](#csv-export)
  - [Error Handling](#error-handling)
  - [Transaction Simulation](#transaction-simulation)
- [Contract Interface](#contract-interface)
  - [Core Entry Points](#core-entry-points)
  - [Admin Entry Points](#admin-entry-points)
  - [Events](#events)
  - [Errors](#errors)
  - [Storage Model](#storage-model)
- [Pool Adapter Interface](#pool-adapter-interface)
- [Configuration](#configuration)
  - [SDK Configuration Options](#sdk-configuration-options)
  - [Environment Variables](#environment-variables)
  - [Network Endpoints](#network-endpoints)
- [Keeper Service](#keeper-service-1)
- [Testing](#testing)
  - [Contract Tests](#contract-tests)
  - [SDK Tests](#sdk-tests)
  - [Integration Tests](#integration-tests)
- [Performance Considerations](#performance-considerations)
- [Security](#security)
  - [Trust Assumptions](#trust-assumptions)
  - [Audit Checklist](#audit-checklist)
  - [Responsible Disclosure](#responsible-disclosure)
- [Troubleshooting / FAQ](#troubleshooting--faq)
- [Glossary](#glossary)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
  - [Development Workflow](#development-workflow)
  - [Commit Conventions](#commit-conventions)
  - [Code Style](#code-style)
- [Changelog](#changelog)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Why This Exists

Providing liquidity across several pools on Stellar today typically means
juggling several separate transactions, tracking reward accrual manually
across protocols, and reconstructing a tax-ready history from raw ledger
data after the fact. None of that is hard in isolation, but it adds up to
a lot of manual, error-prone bookkeeping for anyone running more than a
handful of positions.

LP Management Suite exists to collapse that workflow into one place:

- **One transaction, many pools** — instead of N separate deposit
  transactions, batch them into one aggregator call.
- **One place to see yield** — compare normalized APY/APR across every
  integrated pool instead of checking each protocol's own UI.
- **One place to see risk** — impermanent loss and utilization tracked
  per-position, with alerts when something needs attention.
- **One export for taxes** — a single CSV covering every pool you've
  touched through the aggregator.

---

## Features

### Multi-Pool Deposit & Rebalancing

Deposit into multiple pools, or shift an existing allocation to new target
weights, in a single Soroban transaction. The aggregator contract batches
the underlying calls to each pool's adapter, so you pay one transaction
fee and get atomic execution — either every leg of the operation succeeds,
or the whole thing reverts.

### Auto-Compound Rewards

Claim accrued rewards from one or more pools and reinvest them back into
the originating position without leaving them idle. Compounding can be
triggered manually through the SDK, or scheduled through the optional
[keeper service](#keeper-service) so it runs on a fixed cadence without
manual intervention.

### Cross-Pool Yield Comparison

Pulls current yield data from every integrated pool adapter and normalizes
it into a common shape (APY, TVL, reward token, fee tier) so pools can be
compared directly, regardless of which underlying protocol they belong
to.

### Position Health Monitoring & Alerts

Continuously-computed health metrics per position:

- **Impermanent loss (IL)** relative to a simple hold strategy
- **Utilization** — how much of a pool's liquidity is actively earning
  fees versus sitting idle in wide ranges (for concentrated-liquidity
  pools)
- **Concentration risk** — how much of a user's total LP exposure sits in
  a single pool or protocol

When a metric crosses a configurable threshold, an alert is emitted that
the SDK surfaces to subscribers via `onAlert`.

### CSV Export for Tax Reporting

Generates a CSV of deposits, withdrawals, compounds, and realized/
unrealized gains across all pools accessed through the aggregator, over an
arbitrary date range. Intended as an input to tax software or an
accountant, not as tax advice — see [Security](#security) and
[FAQ](#troubleshooting--faq) for caveats.

---

## Architecture

### High-Level Diagram

```
┌───────────────────────────────────────────────────────────────────┐
│                         Client Application                          │
│                 (web / mobile / CLI — not included)                  │
└──────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                   TypeScript SDK  (@lp-suite/sdk)                    │
│                                                                       │
│  core/          deposit, withdraw, rebalance, compound                │
│  analytics/     yieldCompare, health, impermanentLoss                 │
│  export/        csvExport, reportTemplates                            │
│  tx/            txBuilder, simulate, signAndSubmit                     │
│  rpc/           sorobanRpcClient, retryPolicy                         │
│  alerts/        alertEmitter, thresholds                              │
└──────────────────────────────┬──────────────────────────────────┘
                                │  Soroban RPC (JSON-RPC over HTTPS)
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Aggregator Contract (Soroban / Rust)              │
│                                                                       │
│  deposit.rs      withdraw.rs      rebalance.rs      compound.rs       │
│  router.rs       health.rs        storage.rs        events.rs         │
│  admin.rs        errors.rs        types.rs                            │
└──────────────────────────────┬──────────────────────────────────┘
                                │  cross-contract calls
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │ Soroswap       │ │ Phoenix        │ │ Generic AMM    │
    │ Adapter        │ │ Adapter        │ │ Adapter        │
    └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
            ▼                 ▼                 ▼
       Pool A (LP)       Pool B (LP)       Pool C (LP)

┌───────────────────────────────────────────────────────────────────┐
│                   Keeper Service (optional, off-chain)               │
│      Polls positions → triggers scheduled compound()/alert()        │
└───────────────────────────────────────────────────────────────────┘
```

### Aggregator Contract

The aggregator is the single on-chain entry point clients interact with.
It does not implement AMM logic itself — it holds routing and bookkeeping
logic:

- Maintains a registry mapping `pool_id → adapter contract address`
- Validates and batches deposit/withdraw/rebalance instructions across
  multiple pools in one invocation
- Tracks each user's positions (shares, cost basis, last-compound
  timestamp) in contract storage
- Emits structured events for every state-changing action, which the SDK
  and any off-chain indexer can consume
- Exposes read-only views for yield and health data, computed from
  adapter calls plus stored position data

### Pool Adapters

Each supported protocol (Soroswap, Phoenix, a generic constant-product
AMM, etc.) has its own adapter contract implementing a shared interface
(see [Pool Adapter Interface](#pool-adapter-interface)). The aggregator
never talks to a third-party pool contract directly — it always goes
through the corresponding adapter. This keeps protocol-specific quirks
(different reward-claim mechanics, different share accounting) isolated,
so adding support for a new protocol means writing a new adapter rather
than modifying the aggregator's core logic.

### TypeScript SDK

The SDK is the primary integration point for any client application. It
is organized by concern rather than by feature, so that, for example, all
transaction-building logic lives in `tx/` regardless of which high-level
action (deposit, rebalance, compound) is using it. Responsibilities:

- Building and simulating Soroban transactions before submission
- Batching multi-pool operations into the fewest possible transactions
- Signing via a caller-supplied `signTransaction` callback (so it is
  wallet-agnostic — Freighter, Albedo, a server-side signer, etc. can all
  be plugged in)
- Aggregating on-chain data into the higher-level views described in
  [Features](#features) (yield comparison, health, CSV export)
- Emitting alerts to subscribers when thresholds are crossed

### Keeper Service

An optional Node.js service (`keeper/`) that polls user positions on a
schedule and calls `compound()` or evaluates alert thresholds on their
behalf, so auto-compounding doesn't depend on a client being online. This
is off-chain automation, not part of the trust-minimized contract layer —
see [Trust Assumptions](#trust-assumptions) for what that implies.

### Data Flow: A Rebalance Walkthrough

1. Client calls `client.rebalance({ targetWeights })` on the SDK.
2. The SDK reads current positions from the aggregator (`get_position`)
   and current pool state from each relevant adapter.
3. `tx/txBuilder.ts` computes the deltas needed to reach the target
   weights and assembles a single Soroban transaction invoking the
   aggregator's `rebalance` entry point with those deltas.
4. `tx/simulate.ts` simulates the transaction via RPC to catch failures
   and estimate fees before asking the user to sign.
5. The user signs via the supplied `signTransaction` callback.
6. `tx/signAndSubmit.ts` submits the signed transaction and polls for
   confirmation.
7. On confirmation, the aggregator contract has called each affected pool
   adapter to withdraw from over-weighted pools and deposit into
   under-weighted ones, updated stored position data, and emitted
   `rebalance` events.
8. The SDK parses the returned events/ledger changes and resolves the
   original `rebalance()` promise with a structured result.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contracts | [Soroban](https://soroban.stellar.org/) (Rust, compiled to WASM) |
| Client SDK | TypeScript, targeting Node.js ≥ 18 and modern browsers |
| RPC | Soroban RPC (JSON-RPC over HTTPS) |
| Off-chain automation | Node.js keeper service, Docker-deployable |
| Network | Stellar Testnet, Futurenet, and Mainnet |
| Build tooling | Cargo (contracts), npm/pnpm (SDK), GitHub Actions (CI) |

---

## Project Structure

```
lp-management-suite/
├── contracts/
│   ├── aggregator/                     # Core aggregator contract
│   │   ├── src/
│   │   │   ├── lib.rs                  # Contract entry points
│   │   │   ├── deposit.rs              # Multi-pool deposit logic
│   │   │   ├── withdraw.rs             # Multi-pool withdrawal logic
│   │   │   ├── rebalance.rs            # Target-weight rebalancing
│   │   │   ├── compound.rs             # Reward claim & reinvest
│   │   │   ├── health.rs               # On-chain health/IL calculations
│   │   │   ├── router.rs               # Pool routing & adapter dispatch
│   │   │   ├── storage.rs              # Persistent state (positions, config)
│   │   │   ├── events.rs               # Emitted contract events
│   │   │   ├── errors.rs               # Custom error types
│   │   │   ├── admin.rs                # Admin/governance functions
│   │   │   └── types.rs                # Shared structs & enums
│   │   ├── tests/
│   │   │   ├── deposit_test.rs
│   │   │   ├── withdraw_test.rs
│   │   │   ├── rebalance_test.rs
│   │   │   ├── compound_test.rs
│   │   │   ├── router_test.rs
│   │   │   └── integration_test.rs
│   │   ├── Cargo.toml
│   │   └── Makefile
│   ├── adapters/                       # Per-protocol pool adapters
│   │   ├── soroswap_adapter/
│   │   │   ├── src/lib.rs
│   │   │   ├── Cargo.toml
│   │   │   └── tests/
│   │   ├── phoenix_adapter/
│   │   │   ├── src/lib.rs
│   │   │   ├── Cargo.toml
│   │   │   └── tests/
│   │   └── generic_amm_adapter/
│   │       ├── src/lib.rs
│   │       ├── Cargo.toml
│   │       └── tests/
│   ├── shared/                         # Shared contract crates
│   │   ├── math/                       # Fixed-point math, IL formulas
│   │   │   └── src/lib.rs
│   │   └── interfaces/                 # Common trait definitions for adapters
│   │       └── src/lib.rs
│   └── Cargo.toml                      # Workspace manifest
│
├── sdk/
│   ├── src/
│   │   ├── client.ts                   # LpSuiteClient entry point
│   │   ├── config.ts                   # Config validation & defaults
│   │   ├── core/
│   │   │   ├── deposit.ts
│   │   │   ├── withdraw.ts
│   │   │   ├── rebalance.ts
│   │   │   ├── compound.ts
│   │   │   └── autoCompoundScheduler.ts
│   │   ├── analytics/
│   │   │   ├── yieldCompare.ts
│   │   │   ├── health.ts
│   │   │   ├── impermanentLoss.ts
│   │   │   └── historicalMetrics.ts
│   │   ├── export/
│   │   │   ├── csvExport.ts
│   │   │   └── reportTemplates.ts
│   │   ├── tx/
│   │   │   ├── txBuilder.ts            # Batched transaction assembly
│   │   │   ├── simulate.ts             # Pre-flight simulation
│   │   │   └── signAndSubmit.ts
│   │   ├── rpc/
│   │   │   ├── sorobanRpcClient.ts
│   │   │   └── retryPolicy.ts
│   │   ├── alerts/
│   │   │   ├── alertEmitter.ts
│   │   │   └── thresholds.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   └── index.ts
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── deposit.test.ts
│   │   │   ├── rebalance.test.ts
│   │   │   ├── compound.test.ts
│   │   │   ├── yieldCompare.test.ts
│   │   │   └── csvExport.test.ts
│   │   └── integration/
│   │       ├── testnetDeposit.test.ts
│   │       └── fullLifecycle.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .eslintrc.js
│
├── keeper/                             # Off-chain automation service
│   ├── src/
│   │   ├── index.ts                    # Cron/keeper entry point
│   │   ├── compoundJob.ts
│   │   ├── alertJob.ts
│   │   └── logger.ts
│   ├── Dockerfile
│   └── package.json
│
├── examples/
│   ├── cli/
│   │   ├── src/index.ts                # Example CLI using the SDK
│   │   └── package.json
│   └── web-dashboard/                  # Example front-end integration
│       ├── src/
│       └── package.json
│
├── scripts/
│   ├── deploy.sh
│   ├── deploy_adapters.sh
│   ├── fund_testnet_account.sh
│   └── generate_bindings.sh            # Regenerate TS bindings from contract specs
│
├── docs/
│   ├── architecture.md
│   ├── contract-interface.md
│   ├── sdk-reference.md
│   ├── adapter-integration-guide.md
│   └── tax-export-spec.md
│
├── .github/
│   └── workflows/
│       ├── contract-ci.yml             # cargo build/test/clippy
│       ├── sdk-ci.yml                  # npm build/test/lint
│       └── release.yml
│
├── .env.example
├── LICENSE
└── README.md
```

> Trim or rename directories to match what you actually build — not every
> deployment needs the `keeper/` service or more than one adapter on day
> one. This layout is meant to scale to a larger codebase without
> restructuring later.

---

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain) with the `wasm32-unknown-unknown` target
- [Soroban CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/soroban-cli)
- Node.js ≥ 18 and npm/pnpm/yarn
- A funded Stellar account on the target network (Testnet recommended for development)
- Docker (optional, only if running the keeper service)

```bash
rustup target add wasm32-unknown-unknown
cargo install --locked soroban-cli
```

### Installation

```bash
git clone https://github.com/your-org/lp-management-suite.git
cd lp-management-suite

# Install SDK dependencies
cd sdk
npm install

# (Optional) install keeper service dependencies
cd ../keeper
npm install
```

### Building the Contracts

Build the whole workspace (aggregator + all adapters + shared crates):

```bash
cd contracts
soroban contract build
```

Or build a single crate during development:

```bash
cd contracts/aggregator
soroban contract build
```

Build artifacts land under `target/wasm32-unknown-unknown/release/`.

### Running Tests Locally

```bash
# Contracts
cd contracts
cargo test --workspace

# SDK
cd sdk
npm test
```

See [Testing](#testing) for more detail on what each suite covers.

### Deploying to Testnet

```bash
soroban contract deploy \
  --wasm contracts/aggregator/target/wasm32-unknown-unknown/release/aggregator.wasm \
  --source <YOUR_IDENTITY> \
  --network testnet
```

Repeat for each adapter, then register each adapter's contract ID with
the aggregator via its admin `register_pool` entry point (see
[Admin Entry Points](#admin-entry-points)).

### Deploying to Mainnet

Mainnet deployment follows the same steps as Testnet with
`--network mainnet` and a funded Mainnet account, but should only be done
after:

1. A third-party security audit of the aggregator and adapter contracts
2. A staged rollout with deposit caps
3. Confirming admin keys are held in a multisig, not a single EOA-style
   signer

See [Security](#security) before deploying anywhere near real funds.

---

## SDK Usage

### Initialization

```typescript
import { LpSuiteClient } from "@lp-suite/sdk";

const client = new LpSuiteClient({
  contractId: "<AGGREGATOR_CONTRACT_ID>",
  network: "testnet", // "testnet" | "futurenet" | "mainnet"
  rpcUrl: "https://soroban-testnet.stellar.org",
  account: userPublicKey,
  signTransaction, // wallet-provided signing callback
});
```

### Multi-Pool Deposit

```typescript
const result = await client.deposit({
  allocations: [
    { poolId: "pool-a", amount: "1000" },
    { poolId: "pool-b", amount: "2500" },
    { poolId: "pool-c", amount: "500" },
  ],
});

console.log(result.txHash, result.positions);
```

### Withdrawals

```typescript
const result = await client.withdraw({
  allocations: [
    { poolId: "pool-a", amount: "400" },
  ],
});
```

Pass `full: true` instead of `amount` on an allocation to withdraw an
entire position from that pool.

### Rebalancing

```typescript
await client.rebalance({
  targetWeights: {
    "pool-a": 0.5,
    "pool-b": 0.3,
    "pool-c": 0.2,
  },
});
```

Weights must sum to `1.0` across the pools included in the call; pools
omitted from `targetWeights` are left untouched.

### Auto-Compound

```typescript
// One-off compound
await client.compound({ poolIds: ["pool-a", "pool-b"] });

// Register for scheduled compounding via the keeper service
await client.setAutoCompound({
  poolIds: ["pool-a", "pool-b"],
  frequencyHours: 24,
});

// Cancel scheduled compounding
await client.cancelAutoCompound({ poolIds: ["pool-a"] });
```

### Yield Comparison

```typescript
const yields = await client.compareYields(["pool-a", "pool-b", "pool-c"]);
/*
[
  { poolId: "pool-a", apy: 0.184, tvl: "1200000", rewardToken: "XLM", feeTierBps: 30 },
  { poolId: "pool-b", apy: 0.097, tvl: "3400000", rewardToken: "XLM", feeTierBps: 5  },
  { poolId: "pool-c", apy: 0.223, tvl: "410000",  rewardToken: "USDC", feeTierBps: 100 }
]
*/
```

### Position Health & Alerts

```typescript
const health = await client.getPositionHealth(userPublicKey);
/*
{
  poolId: "pool-a",
  impermanentLossPct: 2.1,
  utilization: 0.78,
  concentrationPct: 0.61,
  alerts: ["IL_THRESHOLD_WARNING"]
}
*/

const unsubscribe = client.onAlert((alert) => {
  console.log(`Alert for ${alert.poolId}: ${alert.type} (${alert.severity})`);
});

// later
unsubscribe();
```

### CSV Export

```typescript
const csv = await client.exportHistoryCsv({
  account: userPublicKey,
  from: "2025-01-01",
  to: "2025-12-31",
});

fs.writeFileSync("lp-history-2025.csv", csv);
```

Columns included: `date, txHash, poolId, action, amount, token, rewardAmount, rewardToken, costBasis, realizedGain`.

### Error Handling

All SDK methods that submit a transaction throw a typed `LpSuiteError` on
failure, with a `code` you can branch on:

```typescript
import { LpSuiteError } from "@lp-suite/sdk";

try {
  await client.rebalance({ targetWeights: { "pool-a": 1.2 } });
} catch (err) {
  if (err instanceof LpSuiteError) {
    switch (err.code) {
      case "INVALID_WEIGHTS":
        console.error("Target weights must sum to 1.0");
        break;
      case "SIMULATION_FAILED":
        console.error("Transaction would fail:", err.details);
        break;
      case "POOL_NOT_REGISTERED":
        console.error("Unknown pool:", err.details?.poolId);
        break;
      default:
        throw err;
    }
  } else {
    throw err;
  }
}
```

### Transaction Simulation

Every state-changing method simulates before requesting a signature. You
can also simulate explicitly without submitting:

```typescript
const simResult = await client.simulate.rebalance({
  targetWeights: { "pool-a": 0.5, "pool-b": 0.5 },
});

console.log(simResult.estimatedFee, simResult.willSucceed);
```

---

## Contract Interface

### Core Entry Points

| Function | Signature (illustrative) | Description |
|---|---|---|
| `deposit` | `deposit(env, user, allocations: Vec<Allocation>)` | Deposits funds across specified pools. |
| `withdraw` | `withdraw(env, user, allocations: Vec<Allocation>)` | Withdraws funds from specified pools. |
| `rebalance` | `rebalance(env, user, target_weights: Map<PoolId, i128>)` | Rebalances a user's positions to target weights. |
| `compound` | `compound(env, user, pool_ids: Vec<PoolId>)` | Claims and reinvests rewards for given pools. |
| `get_position` | `get_position(env, user) -> Vec<Position>` | Returns current position data for a user. |
| `get_pool_yield` | `get_pool_yield(env, pool_id) -> YieldInfo` | Returns current yield metrics for a pool. |
| `get_health` | `get_health(env, user, pool_id) -> HealthInfo` | Returns IL/utilization/concentration metrics. |

### Admin Entry Points

| Function | Description |
|---|---|
| `register_pool(env, admin, pool_id, adapter_address)` | Registers a new pool adapter with the aggregator. |
| `deregister_pool(env, admin, pool_id)` | Removes a pool from active routing (does not affect existing positions). |
| `set_health_thresholds(env, admin, thresholds)` | Configures IL/utilization thresholds used for alerts. |
| `pause(env, admin)` / `unpause(env, admin)` | Emergency pause of deposit/rebalance/compound entry points. |
| `transfer_admin(env, admin, new_admin)` | Transfers admin rights, ideally to a multisig. |

### Events

| Event | Emitted when | Payload |
|---|---|---|
| `deposit` | A deposit completes | `user, pool_id, amount, shares` |
| `withdraw` | A withdrawal completes | `user, pool_id, amount, shares` |
| `rebalance` | A rebalance completes | `user, from_pool, to_pool, amount` |
| `compound` | Rewards are compounded | `user, pool_id, reward_amount, reinvested_amount` |
| `alert` | A health threshold is crossed | `user, pool_id, alert_type, severity` |
| `pool_registered` | Admin registers a pool | `pool_id, adapter_address` |

### Errors

| Code | Meaning |
|---|---|
| `PoolNotRegistered` | Referenced `pool_id` has no registered adapter. |
| `InvalidWeights` | Target weights do not sum to the expected total. |
| `InsufficientBalance` | User does not have enough of the underlying asset. |
| `AdapterCallFailed` | A cross-contract call to a pool adapter failed. |
| `Paused` | The contract is in an admin-paused state. |
| `Unauthorized` | Caller is not the position owner or an authorized admin. |

### Storage Model

| Key | Value | Notes |
|---|---|---|
| `Position(user, pool_id)` | shares, cost basis, last-compound timestamp | Per-user, per-pool position record |
| `PoolConfig(pool_id)` | adapter address, active flag | Registry entry maintained by admin functions |
| `HealthThresholds` | IL/utilization/concentration limits | Global, admin-configurable |
| `Admin` | address | Current admin (ideally a multisig) |

---

## Pool Adapter Interface

Every adapter implements a shared trait so the aggregator can treat all
pools uniformly:

```rust
pub trait PoolAdapter {
    fn deposit(env: Env, user: Address, amount: i128) -> i128; // returns shares minted
    fn withdraw(env: Env, user: Address, shares: i128) -> i128; // returns amount returned
    fn claim_rewards(env: Env, user: Address) -> i128; // returns reward amount claimed
    fn get_yield_info(env: Env) -> YieldInfo;
    fn get_position_value(env: Env, user: Address) -> i128;
}
```

To integrate a new protocol:

1. Create a new crate under `contracts/adapters/`.
2. Implement `PoolAdapter` against the target protocol's actual contract
   interface.
3. Add adapter-specific tests under `contracts/adapters/<name>/tests/`.
4. Deploy the adapter and register it with the aggregator via
   `register_pool`.
5. No changes to the aggregator's core logic are required.

See `docs/adapter-integration-guide.md` for a full walkthrough.

---

## Configuration

### SDK Configuration Options

| Option | Type | Required | Description |
|---|---|---|---|
| `contractId` | `string` | Yes | Deployed aggregator contract ID |
| `network` | `"testnet" \| "futurenet" \| "mainnet"` | Yes | Target network |
| `rpcUrl` | `string` | Yes | Soroban RPC endpoint |
| `account` | `string` | Yes | User's public key |
| `signTransaction` | `function` | Yes | Wallet signing callback |
| `retry` | `{ attempts?: number; backoffMs?: number }` | No | Overrides default RPC retry policy |
| `alertPollIntervalMs` | `number` | No | How often `onAlert` polls for new alerts (default: 30000) |

### Environment Variables

Used by the example CLI, keeper service, and deploy scripts:

```bash
LP_SUITE_CONTRACT_ID=CA...
LP_SUITE_NETWORK=testnet
LP_SUITE_RPC_URL=https://soroban-testnet.stellar.org
LP_SUITE_KEEPER_PRIVATE_KEY=S...      # keeper service only — see Security
LP_SUITE_LOG_LEVEL=info
```

### Network Endpoints

| Network | RPC URL |
|---|---|
| Testnet | `https://soroban-testnet.stellar.org` |
| Futurenet | `https://rpc-futurenet.stellar.org` |
| Mainnet | `https://soroban-rpc.mainnet-provider.example` (use a provider you trust; run your own node for production) |

---

## Keeper Service

The keeper (`keeper/`) is a small Node.js process intended to run
continuously (e.g., in a container) that:

1. Polls the aggregator for users who have `setAutoCompound` active
2. When a position's `frequencyHours` window has elapsed, calls
   `compound()` on the user's behalf
3. Polls health data and re-emits alerts to any configured webhook/queue

```bash
cd keeper
cp .env.example .env   # fill in LP_SUITE_KEEPER_PRIVATE_KEY etc.
npm run start
```

or via Docker:

```bash
docker build -t lp-suite-keeper .
docker run --env-file .env lp-suite-keeper
```

The keeper needs its own funded Stellar account to pay transaction fees
for compounding on users' behalf — see [Trust Assumptions](#trust-assumptions)
for the implications of running or depending on this service.

---

## Testing

### Contract Tests

```bash
cd contracts
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

Covers unit tests per module (`deposit_test.rs`, `rebalance_test.rs`,
etc.) plus a cross-module `integration_test.rs` that exercises a full
deposit → rebalance → compound → withdraw cycle against mocked adapters.

### SDK Tests

```bash
cd sdk
npm test              # unit tests
npm run test:lint     # eslint
```

Unit tests mock the RPC layer; no network access or funded account is
required.

### Integration Tests

```bash
cd sdk
npm run test:integration
```

These run against a real Testnet deployment and require:

- `LP_SUITE_CONTRACT_ID` pointing at a Testnet aggregator
- A funded Testnet account configured for signing

They are excluded from the default `npm test` run and from PR CI to keep
CI deterministic; run them manually before releases.

---

## Performance Considerations

- **Batch size:** the aggregator bounds the number of pools in a single
  `deposit`/`rebalance` call to stay within Soroban's per-transaction
  resource limits (CPU instructions, ledger read/write footprint). The
  SDK automatically splits an oversized request into multiple sequential
  transactions and surfaces this in the result.
- **Simulation cost:** every write method simulates first, which adds one
  RPC round-trip before the user signs. This is deliberate — it catches
  failures before a fee is spent — but callers building latency-sensitive
  UI should account for it.
- **Yield/health reads:** `compareYields` and `getPositionHealth` fan out
  to every relevant adapter in parallel; response time scales with the
  slowest adapter's read call, not the sum.

---

## Security

### Trust Assumptions

- The **aggregator and adapter contracts** are the trust-minimized layer:
  funds only move according to their logic, enforced by the Soroban
  runtime.
- The **keeper service** is *not* trust-minimized — it is a convenience
  for scheduled compounding. It holds a funded signing key capable of
  calling `compound()` on registered users' behalf. Compounding logic
  should be written so the keeper can only reinvest a user's own accrued
  rewards back into their own position, never redirect funds elsewhere,
  but you are trusting the keeper's liveness and its operator's key
  hygiene.
- **Admin functions** (`register_pool`, `pause`, `transfer_admin`, etc.)
  should be gated behind a multisig before any Mainnet deployment with
  real funds.

### Audit Checklist

Before a Mainnet deployment, at minimum:

- [ ] Third-party audit of the aggregator contract
- [ ] Third-party audit of every pool adapter in use
- [ ] Fuzz testing of `rebalance` weight handling and rounding
- [ ] Verification that `pause()` halts all fund-movement entry points
- [ ] Confirmation that admin keys are multisig, not single-signer
- [ ] Review of keeper key storage and rotation policy
- [ ] Load testing of simulate/submit flow under RPC provider rate limits

### Responsible Disclosure

Report vulnerabilities privately to `security@your-org.example` rather
than filing a public issue. Please include steps to reproduce and, where
possible, an estimate of severity/impact.

---

## Troubleshooting / FAQ

**"Simulation failed" on rebalance with weights that sum to 1.0.**
Floating-point weights can sum to `0.9999999...` after arithmetic; the
SDK rounds to the nearest basis point internally, but very small
allocations (below the pool's minimum deposit) can still fail simulation.
Check `err.details` for the specific pool.

**Auto-compound isn't firing.**
Confirm the keeper service is running and its account is funded for
transaction fees; `setAutoCompound` only registers intent on-chain, it
does not run anything itself without the keeper (or your own equivalent
scheduler) polling for it.

**Does the CSV export constitute tax advice?**
No. It's a structured summary of on-chain activity intended as an input
to your own accounting process or software — verify totals against raw
ledger data before filing, and consult a tax professional for your
jurisdiction.

**Can I use the SDK without the keeper service?**
Yes — `compound()` can always be called manually. The keeper is purely
optional automation.

---

## Glossary

| Term | Meaning |
|---|---|
| **LP** | Liquidity Provider — someone who deposits assets into a pool to earn fees/rewards |
| **AMM** | Automated Market Maker — the pool contract type most adapters target |
| **IL** | Impermanent Loss — the opportunity cost of providing liquidity versus simply holding the underlying assets |
| **APY / APR** | Annual Percentage Yield / Rate — normalized return figures used in yield comparison |
| **Adapter** | A contract translating the aggregator's generic calls into a specific protocol's interface |
| **Keeper** | An off-chain service that triggers on-chain actions on a schedule |

---

## Roadmap

- [ ] Additional pool protocol integrations
- [ ] Configurable rebalancing strategies (threshold-based, time-based)
- [ ] Mobile SDK bindings
- [ ] On-chain alert subscriptions (push rather than poll)
- [ ] Tax report templates for additional jurisdictions
- [ ] Governance module for community-voted pool registration
- [ ] Gas/fee optimization pass on the batched transaction builder

---

## Contributing

Contributions are welcome. Please open an issue to discuss significant
changes before submitting a pull request.

### Development Workflow

1. Fork the repo and create a feature branch off `main`.
2. Make your changes with accompanying tests.
3. Run `cargo test --workspace` and `npm test` (in `sdk/`) locally.
4. Open a PR describing the change and linking any related issue.

### Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(sdk): add support for partial withdrawals
fix(aggregator): correct rounding in rebalance weight calculation
docs(readme): expand adapter integration guide
```

### Code Style

- Rust: `cargo fmt` and `cargo clippy -- -D warnings` must pass.
- TypeScript: `eslint` config in `sdk/.eslintrc.js`; run `npm run lint`.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) (generated per release) for version
history once the project has tagged releases.

---

## Acknowledgments

Built on [Soroban](https://soroban.stellar.org/) and the wider Stellar
developer ecosystem. Thanks to the maintainers of the pool protocols this
project integrates with via adapters.

---

## License

[MIT](LICENSE) — update to match your project's actual license.

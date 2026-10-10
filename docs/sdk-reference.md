# SDK Reference

Full reference for `@lp-suite/sdk`.
For a quickstart, see [README.md — SDK Usage](../README.md#sdk-usage).

---

## Installation

```bash
cd sdk
npm install
npm run build          # compiles TypeScript → dist/
```

---

## Initialisation

```typescript
import { LpSuiteClient } from "@lp-suite/sdk";

const client = new LpSuiteClient({
  contractId:      "<AGGREGATOR_CONTRACT_ID>",
  network:         "testnet",          // "testnet" | "futurenet" | "mainnet"
  rpcUrl:          "https://soroban-testnet.stellar.org",
  account:         userPublicKey,
  signTransaction,                     // wallet callback
  // optional:
  retry:                { attempts: 3, backoffMs: 1000 },
  alertPollIntervalMs:  30_000,
});
```

All options are validated by `config.ts` at construction time.
Missing required fields throw synchronously.

---

## Core Transaction Methods

### `client.deposit(params)`

```typescript
await client.deposit({
  allocations: [
    { poolId: "soroswap",    amount: "1000" },
    { poolId: "phoenix",     amount: "2500" },
    { poolId: "generic-amm", amount: "500"  },
  ],
});
// → TxResult { txHash: string, positions: Position[] }
```

Allocations with zero or missing `amount` are forwarded to the aggregator
(which skips them on-chain).  If the allocation list exceeds
`MAX_POOLS_PER_TX` (10), the SDK automatically splits it into multiple
sequential transactions and returns a merged `TxResult`.

### `client.withdraw(params)`

```typescript
await client.withdraw({
  allocations: [
    { poolId: "soroswap", amount: "400" },
    { poolId: "phoenix",  full: true },    // withdraw entire position
  ],
});
```

Passing `full: true` sets the on-chain `amount` to `i128::MAX`, which the
aggregator interprets as "withdraw everything".

### `client.rebalance(params)`

```typescript
await client.rebalance({
  targetWeights: {
    "soroswap":    0.5,
    "phoenix":     0.3,
    "generic-amm": 0.2,
  },
});
```

Weights are decimal fractions (must sum to exactly `1.0`).  Internally the
SDK converts them to basis points (×10 000) before building the
transaction.  Floating-point sums that differ from `1.0` by more than
`1e-9` produce an `INVALID_WEIGHTS` error before simulation.

### `client.compound(params)`

```typescript
await client.compound({ poolIds: ["soroswap", "phoenix"] });
```

### `client.setAutoCompound(params)`

```typescript
await client.setAutoCompound({
  poolIds: ["soroswap"],
  frequencyHours: 24,
});
```

Registers intent on-chain.  The keeper service must be running to act on it.

### `client.cancelAutoCompound(params)`

```typescript
await client.cancelAutoCompound({ poolIds: ["soroswap"] });
```

---

## Analytics Methods

### `client.compareYields(poolIds)`

```typescript
const yields = await client.compareYields(["soroswap", "phoenix", "generic-amm"]);
/*
[
  { poolId: "soroswap",    apy: 0.184, tvl: "1200000", rewardToken: "XLM",  feeTierBps: 30  },
  { poolId: "phoenix",     apy: 0.097, tvl: "3400000", rewardToken: "XLM",  feeTierBps: 5   },
  { poolId: "generic-amm", apy: 0.223, tvl: "410000",  rewardToken: "USDC", feeTierBps: 100 },
]
*/
```

Fans out to all requested pools in parallel and normalises the on-chain
`YieldInfo` (which uses `PRECISION = 1_000_000`) into decimal fractions.

### `client.getPositionHealth(account)`

```typescript
const health = await client.getPositionHealth(userPublicKey);
/*
[{
  poolId: "soroswap",
  impermanentLossPct: 2.1,
  utilization: 0.78,
  concentrationPct: 0.61,
  alerts: ["IL_THRESHOLD_WARNING"],
}]
```

Returns one `PositionHealth` entry per active position.  Alert codes are
populated by the on-chain `get_health` entry point when a metric crosses
the stored `HealthThresholds`.

---

## Alert Subscription

```typescript
const unsubscribe = client.onAlert((alert) => {
  console.log(`${alert.poolId}: ${alert.type} (${alert.severity})`);
  // alert.timestamp: number (Unix ms)
});

// Cancel polling later:
unsubscribe();
```

`onAlert` starts a polling loop on `alertPollIntervalMs` (default 30 s).
All active subscribers share one loop; the loop stops automatically when
the last subscriber calls its unsubscribe function.

---

## CSV Export

```typescript
const csv = await client.exportHistoryCsv({
  account: userPublicKey,
  from: "2026-01-01",
  to:   "2026-12-31",
});
fs.writeFileSync("lp-history-2026.csv", csv);
```

Columns (in order):
`date`, `txHash`, `poolId`, `action`, `amount`, `token`,
`rewardAmount`, `rewardToken`, `costBasis`, `realizedGain`

See [docs/tax-export-spec.md](./tax-export-spec.md) for column semantics.

---

## Transaction Simulation

Every state-changing method simulates before requesting a signature.
You can also simulate explicitly:

```typescript
const result = await client.simulate.rebalance({
  targetWeights: { "soroswap": 0.5, "phoenix": 0.5 },
});
console.log(result.estimatedFee, result.willSucceed);
// SimulateResult { estimatedFee: string, willSucceed: boolean, error?: string }
```

`client.simulate.deposit` and `client.simulate.compound` are also available.

---

## Error Handling

All SDK methods that touch the network throw `LpSuiteError` on failure.

```typescript
import { LpSuiteError } from "@lp-suite/sdk";

try {
  await client.rebalance({ targetWeights: { "soroswap": 1.2 } });
} catch (err) {
  if (err instanceof LpSuiteError) {
    switch (err.code) {
      case "INVALID_WEIGHTS":       /* weights don't sum to 1.0 */ break;
      case "SIMULATION_FAILED":     /* err.details has XDR/reason */ break;
      case "POOL_NOT_REGISTERED":   /* err.details.poolId */ break;
      case "INSUFFICIENT_BALANCE":  break;
      case "ADAPTER_CALL_FAILED":   break;
      case "PAUSED":                break;
      case "UNAUTHORIZED":          break;
      case "RPC_ERROR":             break;
      default: throw err;
    }
  }
}
```

Error codes map 1-to-1 to contract error variants; `RPC_ERROR` covers
transport-level failures that occur before the contract is invoked.

---

## RPC Client and Retry Policy

`rpc/sorobanRpcClient.ts` wraps Soroban JSON-RPC calls.  The retry policy
(`rpc/retryPolicy.ts`) retries transient failures with exponential
back-off, governed by the `retry` config option:

```typescript
retry: {
  attempts: 3,      // max attempts (default: DEFAULT_RETRY_ATTEMPTS = 3)
  backoffMs: 1000,  // initial back-off (doubles each retry)
}
```

---

## Modules

| Module | File | Responsibility |
|---|---|---|
| Client | `src/client.ts` | `LpSuiteClient` class, method dispatch |
| Config | `src/config.ts` | Validation, defaults, `ValidatedConfig` type |
| Types | `src/types.ts` | All exported TypeScript types and `LpSuiteError` |
| Constants | `src/constants.ts` | Network URLs, `MAX_POOLS_PER_TX`, precision constants |
| Deposit | `src/core/deposit.ts` | Deposit flow |
| Withdraw | `src/core/withdraw.ts` | Withdraw flow |
| Rebalance | `src/core/rebalance.ts` | Weight conversion, rebalance flow |
| Compound | `src/core/compound.ts` | Compound flow |
| AutoCompound | `src/core/autoCompoundScheduler.ts` | `setAutoCompound` / `cancelAutoCompound` |
| Yield | `src/analytics/yieldCompare.ts` | `compareYields` |
| Health | `src/analytics/health.ts` | `getPositionHealth` |
| IL | `src/analytics/impermanentLoss.ts` | Client-side IL calculation helpers |
| History | `src/analytics/historicalMetrics.ts` | Historical data aggregation |
| CSV | `src/export/csvExport.ts` | `exportHistoryCsv` |
| Templates | `src/export/reportTemplates.ts` | CSV column/header definitions |
| AlertEmitter | `src/alerts/alertEmitter.ts` | `onAlert` polling loop |
| Thresholds | `src/alerts/thresholds.ts` | Default alert threshold constants |
| TxBuilder | `src/tx/txBuilder.ts` | Transaction assembly, batching |
| Simulate | `src/tx/simulate.ts` | Pre-flight RPC simulation |
| SignAndSubmit | `src/tx/signAndSubmit.ts` | Sign callback + submission + polling |
| RPC | `src/rpc/sorobanRpcClient.ts` | JSON-RPC wrapper |
| Retry | `src/rpc/retryPolicy.ts` | Exponential back-off retry |

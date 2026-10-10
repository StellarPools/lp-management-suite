# Tax Export Specification

Describes the CSV format produced by `client.exportHistoryCsv()` and
`sdk/src/export/csvExport.ts`.

> **Disclaimer:** This export is a structured summary of on-chain activity
> intended as an input to your own accounting process or tax software.
> It is not tax advice.  Verify totals against raw ledger data before
> filing, and consult a qualified tax professional for your jurisdiction.
> See [README.md FAQ](../README.md#troubleshooting--faq).

---

## Usage

```typescript
const csv = await client.exportHistoryCsv({
  account: userPublicKey,    // Stellar public key (G-address)
  from:    "2026-01-01",     // ISO 8601 date, inclusive
  to:      "2026-12-31",     // ISO 8601 date, inclusive
});
fs.writeFileSync("lp-history-2026.csv", csv);
```

---

## Columns

The CSV has a header row followed by one row per event.  Columns appear
in this exact order:

| Column | Type | Description |
|---|---|---|
| `date` | ISO 8601 datetime | Ledger close time of the transaction, UTC |
| `txHash` | string | Stellar transaction hash (hex) |
| `poolId` | string | Pool identifier as registered with the aggregator |
| `action` | string | One of `deposit`, `withdraw`, `compound`, `rebalance` |
| `amount` | decimal string | Gross amount of the underlying token moved |
| `token` | string | Asset code of the underlying token (e.g. `XLM`, `USDC`) |
| `rewardAmount` | decimal string | Reward amount claimed in this event; `"0"` if not a compound |
| `rewardToken` | string | Asset code of the reward token; `""` if not a compound |
| `costBasis` | decimal string | Running cost basis of the position after this event |
| `realizedGain` | decimal string | Realised gain (positive) or loss (negative) on this event; `"0"` for deposits |

All numeric values are decimal strings to avoid floating-point precision
issues in downstream tools.

---

## Event Coverage

| Aggregator event | `action` value | `amount` | `rewardAmount` |
|---|---|---|---|
| `Deposit` | `deposit` | deposit amount | `"0"` |
| `Withdraw` | `withdraw` | amount returned | `"0"` |
| `Compound` | `compound` | reinvested amount | reward claimed |
| `Rebalance` (withdraw leg) | `rebalance` | shares moved out | `"0"` |
| `Rebalance` (deposit leg) | `rebalance` | shares moved in | `"0"` |

---

## Example Output

```
date,txHash,poolId,action,amount,token,rewardAmount,rewardToken,costBasis,realizedGain
2026-03-15T14:22:01Z,abc123...,soroswap,deposit,1000,XLM,0,,1000,0
2026-04-01T09:00:00Z,def456...,soroswap,compound,12.5,XLM,12.5,XLM,1012.5,0
2026-06-30T18:45:00Z,ghi789...,soroswap,withdraw,400,XLM,0,,612.5,87.5
```

---

## Implementation Notes

- Events are fetched from the Soroban RPC event ledger scan using the
  aggregator contract ID as the filter.
- The `from`/`to` dates are converted to ledger sequence ranges using the
  RPC `getLedgers` call.
- `costBasis` is maintained as a running total per position: deposits
  increase it; withdrawals reduce it proportionally to the fraction of
  shares redeemed.
- `realizedGain = withdrawnAmount - (costBasis × fractionWithdrawn)`.
  This is a simple FIFO-like average cost approach, not lot-specific.
  Consult your tax professional for the appropriate method in your
  jurisdiction.

---

## Limitations

- Unrealised gains are not included; only settled transactions appear.
- The export covers only activity routed through the aggregator contract.
  Transactions made directly with pool protocols are not reflected.
- Date range filtering is performed against ledger close timestamps and
  may differ slightly from calendar day boundaries in some timezones.

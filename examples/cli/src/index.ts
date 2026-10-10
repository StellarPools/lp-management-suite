#!/usr/bin/env ts-node
/**
 * examples/cli/src/index.ts
 *
 * Minimal CLI that exercises the four SDK methods highlighted in README.md
 * "SDK Usage":
 *   - deposit
 *   - rebalance
 *   - compareYields
 *   - exportHistoryCsv
 *
 * Usage:
 *   LP_SUITE_CONTRACT_ID=C... LP_SUITE_NETWORK=testnet ts-node src/index.ts <command>
 *
 * Commands:
 *   deposit    — deposit across pool-a, pool-b, and pool-c
 *   rebalance  — rebalance to target weights
 *   yields     — compare yields across all three pools
 *   export     — export a year's CSV history to stdout
 *   help       — print this message
 *
 * For signing, the CLI uses a dummy signer that just returns the XDR
 * unchanged.  Replace `signTransaction` below with a real signer
 * (e.g. Soroban CLI key or Freighter) before connecting to Mainnet.
 */

import * as fs from "fs";
import { LpSuiteClient, LpSuiteError } from "@lp-suite/sdk";

// ── Configuration from environment ──────────────────────────────────────────
const CONTRACT_ID = process.env["LP_SUITE_CONTRACT_ID"] ?? "";
const NETWORK = (process.env["LP_SUITE_NETWORK"] ?? "testnet") as
  | "testnet"
  | "futurenet"
  | "mainnet";
const RPC_URL =
  process.env["LP_SUITE_RPC_URL"] ?? "https://soroban-testnet.stellar.org";
// In a real CLI, derive the public key from a real keypair or identity.
const ACCOUNT = process.env["LP_SUITE_ACCOUNT"] ?? "GDUMMYACCOUNTREPLACEMEWITHREALPUBLICKEY";

if (!CONTRACT_ID) {
  console.error("ERROR: LP_SUITE_CONTRACT_ID environment variable is required.");
  process.exit(1);
}

/**
 * Signing callback.  In production, replace this with a call to
 * `soroban contract sign`, Freighter's browser extension API, or
 * another wallet that holds the private key for ACCOUNT.
 */
async function signTransaction(xdr: string): Promise<string> {
  // Passthrough — not suitable for submitting real transactions.
  return xdr;
}

const client = new LpSuiteClient({
  contractId: CONTRACT_ID,
  network: NETWORK,
  rpcUrl: RPC_URL,
  account: ACCOUNT,
  signTransaction,
});

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdDeposit(): Promise<void> {
  console.log("Depositing into pool-a (1000), pool-b (2500), pool-c (500)...");
  const result = await client.deposit({
    allocations: [
      { poolId: "soroswap", amount: "1000" },
      { poolId: "phoenix",  amount: "2500" },
      { poolId: "generic-amm", amount: "500" },
    ],
  });
  console.log("txHash:   ", result.txHash);
  console.log("positions:", JSON.stringify(result.positions, null, 2));
}

async function cmdRebalance(): Promise<void> {
  console.log("Rebalancing to soroswap=50%, phoenix=30%, generic-amm=20%...");
  const result = await client.rebalance({
    targetWeights: {
      soroswap:    0.5,
      phoenix:     0.3,
      "generic-amm": 0.2,
    },
  });
  console.log("txHash:   ", result.txHash);
  console.log("positions:", JSON.stringify(result.positions, null, 2));
}

async function cmdYields(): Promise<void> {
  console.log("Fetching yield comparison for soroswap, phoenix, generic-amm...");
  const yields = await client.compareYields(["soroswap", "phoenix", "generic-amm"]);
  console.log("Yields:");
  for (const entry of yields) {
    console.log(
      `  ${entry.poolId.padEnd(14)} APY: ${(entry.apy * 100).toFixed(2).padStart(6)}%` +
      `  TVL: ${entry.tvl.padStart(12)}  reward: ${entry.rewardToken}  fee: ${entry.feeTierBps}bps`
    );
  }
}

async function cmdExport(): Promise<void> {
  const from = "2026-01-01";
  const to   = "2026-12-31";
  console.log(`Exporting LP history ${from} – ${to} for ${ACCOUNT}...`);
  const csv = await client.exportHistoryCsv({ account: ACCOUNT, from, to });
  const filename = `lp-history-${from.slice(0, 4)}.csv`;
  fs.writeFileSync(filename, csv);
  console.log(`Written to ${filename} (${csv.split("\n").length - 1} rows)`);
}

function printHelp(): void {
  console.log(
    [
      "LP Management Suite — example CLI",
      "",
      "Commands:",
      "  deposit    Deposit across soroswap / phoenix / generic-amm",
      "  rebalance  Rebalance to 50 / 30 / 20 % weights",
      "  yields     Compare yields across all three pools",
      "  export     Export 2026 history as CSV",
      "  help       Print this message",
      "",
      "Required environment variables:",
      "  LP_SUITE_CONTRACT_ID   Deployed aggregator contract ID",
      "  LP_SUITE_ACCOUNT       Your Stellar public key",
      "",
      "Optional:",
      "  LP_SUITE_NETWORK       testnet | futurenet | mainnet  (default: testnet)",
      "  LP_SUITE_RPC_URL       Soroban RPC endpoint",
    ].join("\n")
  );
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const command = process.argv[2] ?? "help";

(async () => {
  try {
    switch (command) {
      case "deposit":   await cmdDeposit();   break;
      case "rebalance": await cmdRebalance(); break;
      case "yields":    await cmdYields();    break;
      case "export":    await cmdExport();    break;
      case "help":
      default:
        printHelp();
        break;
    }
  } catch (err) {
    if (err instanceof LpSuiteError) {
      console.error(`LpSuiteError [${err.code}]: ${err.message}`);
      if (err.details) console.error("Details:", err.details);
    } else {
      console.error("Unexpected error:", err);
    }
    process.exit(1);
  }
})();

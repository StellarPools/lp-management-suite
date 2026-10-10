/**
 * examples/web-dashboard/src/main.ts
 *
 * Minimal browser front-end wiring for the LP Management Suite SDK.
 *
 * This file shows how to initialise LpSuiteClient in a browser context,
 * hook up each SDK method to a DOM button, and display results in a
 * pre-formatted output area — matching every method shown in README.md
 * "SDK Usage".
 *
 * Replace the placeholder `signTransaction` with your wallet adapter
 * (e.g. Freighter: `window.freighter.signTransaction`) before connecting
 * to a real network.
 *
 * To run:
 *   cd examples/web-dashboard
 *   npm install
 *   npm run dev
 */

import { LpSuiteClient, LpSuiteError } from "@lp-suite/sdk";
import type { LpAlert } from "@lp-suite/sdk";

// ── Configuration ─────────────────────────────────────────────────────────────
// In production, read these from environment variables injected at build time
// (e.g. import.meta.env.VITE_CONTRACT_ID) or from a user-facing settings panel.
const CONFIG = {
  contractId: import.meta.env["VITE_CONTRACT_ID"] ?? "CPLACEHOLDERCONTRACTID",
  network: (import.meta.env["VITE_NETWORK"] ?? "testnet") as
    | "testnet"
    | "futurenet"
    | "mainnet",
  rpcUrl:
    import.meta.env["VITE_RPC_URL"] ??
    "https://soroban-testnet.stellar.org",
  account: import.meta.env["VITE_ACCOUNT"] ?? "GDUMMYACCOUNTREPLACEWITHREALKEY",
};

/**
 * Signing callback — replace with a real wallet integration.
 * Freighter example (browser extension):
 *   import { signTransaction } from "@stellar/freighter-api";
 */
async function signTransaction(xdr: string): Promise<string> {
  // Passthrough placeholder — does NOT sign; replace before going live.
  return xdr;
}

const client = new LpSuiteClient({ ...CONFIG, signTransaction });

// ── DOM helpers ──────────────────────────────────────────────────────────────
function getOutput(): HTMLPreElement {
  return document.getElementById("output") as HTMLPreElement;
}

function log(text: string): void {
  const output = getOutput();
  output.textContent += text + "\n";
}

function clearOutput(): void {
  getOutput().textContent = "";
}

async function run(label: string, fn: () => Promise<unknown>): Promise<void> {
  clearOutput();
  log(`── ${label} ──`);
  try {
    const result = await fn();
    log(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof LpSuiteError) {
      log(`LpSuiteError [${err.code}]: ${err.message}`);
      if (err.details) log(JSON.stringify(err.details, null, 2));
    } else {
      log(String(err));
    }
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────

/** Deposit into three pools — README "Multi-Pool Deposit" example. */
async function onDeposit(): Promise<void> {
  await run("deposit", () =>
    client.deposit({
      allocations: [
        { poolId: "soroswap",    amount: "1000" },
        { poolId: "phoenix",     amount: "2500" },
        { poolId: "generic-amm", amount: "500"  },
      ],
    })
  );
}

/** Withdraw from one pool — README "Withdrawals" example. */
async function onWithdraw(): Promise<void> {
  await run("withdraw", () =>
    client.withdraw({
      allocations: [{ poolId: "soroswap", amount: "400" }],
    })
  );
}

/** Rebalance to target weights — README "Rebalancing" example. */
async function onRebalance(): Promise<void> {
  await run("rebalance", () =>
    client.rebalance({
      targetWeights: { soroswap: 0.5, phoenix: 0.3, "generic-amm": 0.2 },
    })
  );
}

/** Compound rewards — README "Auto-Compound" one-off example. */
async function onCompound(): Promise<void> {
  await run("compound", () =>
    client.compound({ poolIds: ["soroswap", "phoenix"] })
  );
}

/** Compare yields — README "Yield Comparison" example. */
async function onYields(): Promise<void> {
  await run("compareYields", () =>
    client.compareYields(["soroswap", "phoenix", "generic-amm"])
  );
}

/** Position health — README "Position Health & Alerts" example. */
async function onHealth(): Promise<void> {
  await run("getPositionHealth", () =>
    client.getPositionHealth(CONFIG.account)
  );
}

/** Subscribe to alerts — README "Position Health & Alerts" onAlert example. */
let unsubscribeAlerts: (() => void) | null = null;

function onSubscribeAlerts(): void {
  if (unsubscribeAlerts) {
    log("Already subscribed.  Click Unsubscribe first.");
    return;
  }
  clearOutput();
  log("Subscribed to alerts (polling every 30 s)...");
  unsubscribeAlerts = client.onAlert((alert: LpAlert) => {
    log(`Alert: poolId=${alert.poolId}  type=${alert.type}  severity=${alert.severity}`);
  });
}

function onUnsubscribeAlerts(): void {
  if (unsubscribeAlerts) {
    unsubscribeAlerts();
    unsubscribeAlerts = null;
    log("Unsubscribed from alerts.");
  }
}

/** CSV export — README "CSV Export" example. */
async function onExport(): Promise<void> {
  await run("exportHistoryCsv", async () => {
    const csv = await client.exportHistoryCsv({
      account: CONFIG.account,
      from: "2026-01-01",
      to:   "2026-12-31",
    });
    // Trigger a browser download
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = "lp-history-2026.csv";
    link.click();
    URL.revokeObjectURL(url);
    return { rows: csv.split("\n").length - 1, message: "Download started" };
  });
}

// ── Wire up buttons after DOM is ready ───────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-deposit")?.addEventListener("click",     onDeposit);
  document.getElementById("btn-withdraw")?.addEventListener("click",    onWithdraw);
  document.getElementById("btn-rebalance")?.addEventListener("click",   onRebalance);
  document.getElementById("btn-compound")?.addEventListener("click",    onCompound);
  document.getElementById("btn-yields")?.addEventListener("click",      onYields);
  document.getElementById("btn-health")?.addEventListener("click",      onHealth);
  document.getElementById("btn-subscribe")?.addEventListener("click",   onSubscribeAlerts);
  document.getElementById("btn-unsubscribe")?.addEventListener("click", onUnsubscribeAlerts);
  document.getElementById("btn-export")?.addEventListener("click",      onExport);
});

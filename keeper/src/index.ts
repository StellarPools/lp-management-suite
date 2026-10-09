/**
 * Keeper service entry point.
 *
 * Polls the aggregator on a fixed cadence and:
 *   1. Runs the compound job (auto-compound for opted-in users).
 *   2. Runs the alert job (health threshold evaluation and forwarding).
 *
 * Configuration is read from environment variables (see .env.example).
 * The keeper needs its own funded Stellar account to pay transaction fees
 * for compounding on users' behalf, per README "Keeper Service".
 *
 * Trust boundary: this process ONLY calls compound() on behalf of users
 * who opted in.  It never calls any entry point that redirects funds
 * elsewhere, per README "Trust Assumptions".
 *
 * Usage:
 *   node dist/index.js
 *   # or via Docker:
 *   docker build -t lp-suite-keeper .
 *   docker run --env-file .env lp-suite-keeper
 */

import { runCompoundJob } from "./compoundJob";
import { runAlertJob } from "./alertJob";
import { logger } from "./logger";

// ─── Configuration from environment ─────────────────────────────────────────

const CONTRACT_ID = process.env.LP_SUITE_CONTRACT_ID ?? "";
const RPC_URL =
  process.env.LP_SUITE_RPC_URL ?? "https://soroban-testnet.stellar.org";
const KEEPER_ACCOUNT = process.env.LP_SUITE_KEEPER_ACCOUNT ?? "";
// Note: the private key is used by the signing layer (not shown here) to
// authorize compound() calls.  Never log or expose this value.
const _KEEPER_PRIVATE_KEY = process.env.LP_SUITE_KEEPER_PRIVATE_KEY ?? "";

/** Poll interval in milliseconds (default: 5 minutes). */
const POLL_INTERVAL_MS = parseInt(
  process.env.LP_SUITE_KEEPER_POLL_INTERVAL_MS ?? "300000",
  10
);

// ─── Validation ──────────────────────────────────────────────────────────────

function validateConfig(): void {
  if (!CONTRACT_ID) {
    logger.error("LP_SUITE_CONTRACT_ID is required");
    process.exit(1);
  }
  if (!KEEPER_ACCOUNT) {
    logger.error("LP_SUITE_KEEPER_ACCOUNT is required");
    process.exit(1);
  }
  if (!_KEEPER_PRIVATE_KEY) {
    logger.warn(
      "LP_SUITE_KEEPER_PRIVATE_KEY is not set — compound() calls will not be signed"
    );
  }
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  logger.info("Keeper tick started");

  await runCompoundJob(RPC_URL, CONTRACT_ID, KEEPER_ACCOUNT);
  await runAlertJob(RPC_URL, CONTRACT_ID);

  logger.info("Keeper tick complete");
}

async function main(): Promise<void> {
  validateConfig();

  logger.info("LP Suite Keeper starting", {
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    pollIntervalMs: POLL_INTERVAL_MS,
  });

  // Run immediately on startup, then on a fixed interval.
  await tick();
  setInterval(() => {
    tick().catch((err) => {
      logger.error("Keeper tick threw an unhandled error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
  logger.error("Keeper failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

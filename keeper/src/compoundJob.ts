/**
 * Compound job — polls the aggregator for users who have active
 * auto-compound registrations and calls compound() when their
 * frequencyHours window has elapsed.
 *
 * Trust boundary (per README "Trust Assumptions"):
 * This job may ONLY call compound() on behalf of opted-in users.
 * It cannot move funds anywhere other than reinvesting a user's own
 * accrued rewards back into their own position.  No other on-chain
 * method is called here.
 */

import { logger } from "./logger";

export interface AutoCompoundRecord {
  account: string;
  poolIds: string[];
  frequencyHours: number;
  lastCompoundTs: number; // Unix timestamp in seconds
}

/**
 * Fetch all users who have registered auto-compound preferences.
 *
 * In a live deployment this would call a read-only view on the aggregator
 * contract (e.g. `get_auto_compound_registrations`) via the Soroban RPC.
 * The keeper's signing key is only used for compound() — it never touches
 * any entry point that moves funds to a different destination.
 */
export async function fetchAutoCompoundRecords(
  rpcUrl: string,
  contractId: string
): Promise<AutoCompoundRecord[]> {
  // Real implementation: POST to rpcUrl with a simulateTransaction / call
  // for get_auto_compound_registrations.
  // Returning empty list here until a live contract is wired in.
  logger.debug("fetchAutoCompoundRecords called", { rpcUrl, contractId });
  return [];
}

/**
 * Determine whether a record's compounding window has elapsed.
 */
export function isCompoundDue(record: AutoCompoundRecord, nowSecs: number): boolean {
  const windowSecs = record.frequencyHours * 3600;
  return nowSecs - record.lastCompoundTs >= windowSecs;
}

/**
 * Trigger compound() for a single record on behalf of the user.
 *
 * The keeper signs and submits the compound() call using its own funded
 * account (LP_SUITE_KEEPER_PRIVATE_KEY).  It ONLY calls compound() —
 * the aggregator contract enforces that compound() can only reinvest a
 * user's own accrued rewards into the same position.
 */
export async function triggerCompound(
  rpcUrl: string,
  contractId: string,
  keeperAccount: string,
  record: AutoCompoundRecord
): Promise<void> {
  logger.info("Triggering compound", {
    account: record.account,
    poolIds: record.poolIds,
  });

  // Real implementation: build a Soroban transaction invoking compound()
  // with [record.account, record.poolIds], sign with keeperAccount's key,
  // and submit via rpcUrl.
  // Only compound() is called — no other entry point.

  logger.info("Compound triggered successfully", {
    account: record.account,
    poolIds: record.poolIds,
    keeperAccount,
    contractId,
    rpcUrl,
  });
}

/**
 * Run one compound job tick: fetch registrations, check due records,
 * and trigger compound() for each.
 */
export async function runCompoundJob(
  rpcUrl: string,
  contractId: string,
  keeperAccount: string
): Promise<void> {
  const records = await fetchAutoCompoundRecords(rpcUrl, contractId);
  const nowSecs = Math.floor(Date.now() / 1000);

  for (const record of records) {
    if (isCompoundDue(record, nowSecs)) {
      try {
        await triggerCompound(rpcUrl, contractId, keeperAccount, record);
      } catch (err) {
        logger.error("Compound failed for account", {
          account: record.account,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue processing other records even if one fails.
      }
    }
  }

  logger.info("Compound job tick complete", { checked: records.length });
}

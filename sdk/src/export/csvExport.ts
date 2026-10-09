/**
 * CSV export for tax reporting, per README "CSV Export for Tax Reporting".
 *
 * Produces a CSV with exactly the columns listed in README:
 * date, txHash, poolId, action, amount, token, rewardAmount, rewardToken,
 * costBasis, realizedGain
 */

import { SorobanRpcClient } from "../rpc/sorobanRpcClient";
import { fetchHistoricalEvents } from "../analytics/historicalMetrics";

export interface CsvExportParams {
  account: string;
  /** ISO date string, e.g. "2025-01-01". */
  from: string;
  /** ISO date string, e.g. "2025-12-31". */
  to: string;
}

/** Column order per README "CSV Export" section. */
const CSV_COLUMNS = [
  "date",
  "txHash",
  "poolId",
  "action",
  "amount",
  "token",
  "rewardAmount",
  "rewardToken",
  "costBasis",
  "realizedGain",
] as const;

/**
 * Generate a CSV of LP activity for `account` between `from` and `to`.
 * Returns the CSV content as a string.
 */
export async function exportHistoryCsv(
  rpc: SorobanRpcClient,
  params: CsvExportParams
): Promise<string> {
  const events = await fetchHistoricalEvents(
    rpc,
    params.account,
    params.from,
    params.to
  );

  const header = CSV_COLUMNS.join(",");
  const rows = events.map((e) =>
    CSV_COLUMNS.map((col) => csvEscape(String(e[col] ?? ""))).join(",")
  );

  return [header, ...rows].join("\n");
}

/** Escape a single CSV field value. */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Report templates for CSV / tax export.
 *
 * Provides column ordering and header customizations for the CSV exporter.
 * Only the column set described in README "CSV Export" is supported.
 */

/** The canonical column set per README. */
export const TAX_REPORT_COLUMNS = [
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

export type TaxReportColumn = (typeof TAX_REPORT_COLUMNS)[number];

/** Human-readable header labels for display in spreadsheets. */
export const TAX_REPORT_LABELS: Record<TaxReportColumn, string> = {
  date: "Date",
  txHash: "Transaction Hash",
  poolId: "Pool",
  action: "Action",
  amount: "Amount",
  token: "Token",
  rewardAmount: "Reward Amount",
  rewardToken: "Reward Token",
  costBasis: "Cost Basis",
  realizedGain: "Realized Gain/Loss",
};

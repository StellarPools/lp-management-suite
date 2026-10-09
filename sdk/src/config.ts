/**
 * Config validation and defaults.
 *
 * Validates that all required LpSuiteConfig fields are present and applies
 * defaults for optional fields, per README "SDK Configuration Options" table.
 */

import {
  DEFAULT_ALERT_POLL_INTERVAL_MS,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  NETWORK_RPC_URLS,
} from "./constants";
import { LpSuiteConfig, LpSuiteError } from "./types";

export type ValidatedConfig = Required<LpSuiteConfig> & {
  retry: Required<NonNullable<LpSuiteConfig["retry"]>>;
};

/**
 * Validate required fields and apply defaults to optional fields.
 * Throws `LpSuiteError` with code `UNKNOWN` if a required field is missing.
 */
export function validateConfig(config: LpSuiteConfig): ValidatedConfig {
  const required: (keyof LpSuiteConfig)[] = [
    "contractId",
    "network",
    "rpcUrl",
    "account",
    "signTransaction",
  ];

  for (const key of required) {
    if (!config[key]) {
      throw new LpSuiteError(
        "UNKNOWN",
        `LpSuiteClient: required config field "${key}" is missing.`
      );
    }
  }

  const validNetworks = ["testnet", "futurenet", "mainnet"];
  if (!validNetworks.includes(config.network)) {
    throw new LpSuiteError(
      "UNKNOWN",
      `LpSuiteClient: network must be one of ${validNetworks.join(", ")}, got "${config.network}".`
    );
  }

  const defaultRpcUrl =
    NETWORK_RPC_URLS[config.network] ?? config.rpcUrl;

  return {
    contractId: config.contractId,
    network: config.network,
    rpcUrl: config.rpcUrl ?? defaultRpcUrl,
    account: config.account,
    signTransaction: config.signTransaction,
    retry: {
      attempts: config.retry?.attempts ?? DEFAULT_RETRY_ATTEMPTS,
      backoffMs: config.retry?.backoffMs ?? DEFAULT_RETRY_BACKOFF_MS,
    },
    alertPollIntervalMs:
      config.alertPollIntervalMs ?? DEFAULT_ALERT_POLL_INTERVAL_MS,
  };
}

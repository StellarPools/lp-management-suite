/**
 * SDK constants — network endpoints and operational limits.
 *
 * Values here match the "Network Endpoints" and "Performance Considerations"
 * sections of README.md.
 */

/** RPC endpoint for each supported network, per README "Network Endpoints". */
export const NETWORK_RPC_URLS: Record<string, string> = {
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
  // Mainnet requires a trusted provider or self-hosted node.
  mainnet: "https://soroban-rpc.mainnet-provider.example",
};

/** Maximum number of pool allocations in a single batched transaction.
 *  Requests exceeding this are split into multiple sequential transactions,
 *  per README "Performance Considerations". */
export const MAX_POOLS_PER_TX = 10;

/** Default RPC retry attempts. */
export const DEFAULT_RETRY_ATTEMPTS = 3;

/** Default RPC retry back-off in milliseconds. */
export const DEFAULT_RETRY_BACKOFF_MS = 1_000;

/** Default alert polling interval in milliseconds. */
export const DEFAULT_ALERT_POLL_INTERVAL_MS = 30_000;

/** Weight precision: basis points (10 000 = 100%). */
export const WEIGHT_PRECISION = 10_000;

/**
 * Retry policy for RPC calls.
 *
 * Implements exponential back-off with the configurable `attempts` and
 * `backoffMs` values from the SDK config, per README "SDK Configuration Options".
 */

import { LpSuiteError } from "../types";

export interface RetryOptions {
  attempts: number;
  backoffMs: number;
}

/**
 * Execute `fn` with automatic retries on network/RPC errors.
 *
 * @param fn      Async function to retry.
 * @param options Retry configuration.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < options.attempts) {
        // Exponential back-off: backoffMs * 2^(attempt-1)
        const delay = options.backoffMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }
  throw new LpSuiteError(
    "RPC_ERROR",
    `RPC call failed after ${options.attempts} attempts.`,
    { cause: lastError instanceof Error ? lastError.message : String(lastError) }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

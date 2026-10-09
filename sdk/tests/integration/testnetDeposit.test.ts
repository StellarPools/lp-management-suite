/**
 * SDK integration test — Testnet deposit smoke test.
 *
 * GATED: only runs when LP_SUITE_CONTRACT_ID and LP_SUITE_TESTNET_SECRET_KEY
 * are set in the environment.  Excluded from default `npm test` and from PR CI,
 * per README "Integration Tests" section.
 *
 * Run manually before releases:
 *   LP_SUITE_CONTRACT_ID=CA... LP_SUITE_TESTNET_SECRET_KEY=S... npm run test:integration
 */

import { LpSuiteClient } from "../../src/client";

const CONTRACT_ID = process.env.LP_SUITE_CONTRACT_ID ?? "";
const TESTNET_SECRET = process.env.LP_SUITE_TESTNET_SECRET_KEY ?? "";
const TESTNET_PUBLIC = process.env.LP_SUITE_TESTNET_PUBLIC_KEY ?? "";
const RPC_URL = process.env.LP_SUITE_RPC_URL ?? "https://soroban-testnet.stellar.org";
const POOL_ID = process.env.LP_SUITE_TEST_POOL_ID ?? "pool-a";

const SKIP = !CONTRACT_ID || !TESTNET_SECRET || !TESTNET_PUBLIC;

// jest.skip used so tests appear in the runner output but are not executed
// unless the env vars are present.
const describeOrSkip = SKIP ? describe.skip : describe;

describeOrSkip("Testnet deposit (integration)", () => {
  let client: LpSuiteClient;

  beforeAll(() => {
    // In a real test, signTransaction would use @stellar/stellar-sdk to sign
    // the XDR with TESTNET_SECRET.
    const signTransaction = async (xdr: string): Promise<string> => {
      // Placeholder: real implementation signs with TESTNET_SECRET.
      return `signed:${xdr}`;
    };

    client = new LpSuiteClient({
      contractId: CONTRACT_ID,
      network: "testnet",
      rpcUrl: RPC_URL,
      account: TESTNET_PUBLIC,
      signTransaction,
    });
  });

  it("deposit returns a txHash", async () => {
    const result = await client.deposit({
      allocations: [{ poolId: POOL_ID, amount: "100" }],
    });
    expect(typeof result.txHash).toBe("string");
    expect(result.txHash.length).toBeGreaterThan(0);
  }, 60_000 /* 60s timeout for live network */);

  it("compareYields returns entries for the test pool", async () => {
    const yields = await client.compareYields([POOL_ID]);
    expect(yields).toHaveLength(1);
    expect(yields[0].poolId).toBe(POOL_ID);
    expect(yields[0].feeTierBps).toBeGreaterThanOrEqual(0);
  }, 30_000);
});

/**
 * SDK full lifecycle integration test — deposit → rebalance → compound → withdraw.
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
const POOL_A = process.env.LP_SUITE_TEST_POOL_A ?? "pool-a";
const POOL_B = process.env.LP_SUITE_TEST_POOL_B ?? "pool-b";

const SKIP = !CONTRACT_ID || !TESTNET_SECRET || !TESTNET_PUBLIC;
const describeOrSkip = SKIP ? describe.skip : describe;

describeOrSkip("Full lifecycle (integration)", () => {
  let client: LpSuiteClient;

  beforeAll(() => {
    const signTransaction = async (xdr: string): Promise<string> => {
      // Real implementation: sign with TESTNET_SECRET via @stellar/stellar-sdk.
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

  it("deposit → rebalance → compound → withdraw completes without error", async () => {
    // Step 1: Deposit
    const depositResult = await client.deposit({
      allocations: [
        { poolId: POOL_A, amount: "1000" },
        { poolId: POOL_B, amount: "1000" },
      ],
    });
    expect(depositResult.txHash).toBeTruthy();

    // Step 2: Rebalance 70/30
    const rebalanceResult = await client.rebalance({
      targetWeights: { [POOL_A]: 0.7, [POOL_B]: 0.3 },
    });
    expect(rebalanceResult.txHash).toBeTruthy();

    // Step 3: Compound pool-a
    const compoundResult = await client.compound({ poolIds: [POOL_A] });
    expect(compoundResult.txHash).toBeTruthy();

    // Step 4: Withdraw from pool-b
    const withdrawResult = await client.withdraw({
      allocations: [{ poolId: POOL_B, full: true }],
    });
    expect(withdrawResult.txHash).toBeTruthy();
  }, 120_000 /* 2 min timeout for 4 live transactions */);

  it("compareYields returns entries for both test pools", async () => {
    const yields = await client.compareYields([POOL_A, POOL_B]);
    expect(yields).toHaveLength(2);
    for (const y of yields) {
      expect(y.apy).toBeGreaterThanOrEqual(0);
    }
  }, 30_000);

  it("exportHistoryCsv returns CSV with correct header", async () => {
    const csv = await client.exportHistoryCsv({
      account: TESTNET_PUBLIC,
      from: "2025-01-01",
      to: "2030-12-31",
    });
    const header = csv.split("\n")[0];
    expect(header).toBe(
      "date,txHash,poolId,action,amount,token,rewardAmount,rewardToken,costBasis,realizedGain"
    );
  }, 30_000);
});

/**
 * Unit tests for LpSuiteClient — verifies the client wires all core methods
 * and the simulate namespace correctly, with mocked RPC.
 */

import { LpSuiteClient } from "../../src/client";
import { LpSuiteError, LpSuiteConfig } from "../../src/types";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

// Patch the RPC client constructor to return a mock for every test.
const mockSimulate = jest.fn().mockResolvedValue({ estimatedFee: "100", willSucceed: true });
const mockSubmit = jest.fn().mockResolvedValue({ txHash: "client-tx-hash" });
const mockGetPositions = jest.fn().mockResolvedValue([
  { poolId: "pool-a", shares: "1000", costBasis: "1000", lastCompoundTs: 0 },
]);
const mockGetPoolYield = jest.fn().mockResolvedValue({
  poolId: "pool-a",
  apy: 0.184,
  tvl: "1200000",
  rewardToken: "XLM",
  feeTierBps: 30,
});
const mockGetHealth = jest.fn().mockResolvedValue({
  poolId: "pool-a",
  impermanentLossPct: 2.1,
  utilization: 0.78,
  concentrationPct: 0.61,
  alerts: ["IL_THRESHOLD_WARNING"],
});

jest.spyOn(SorobanRpcClient.prototype, "simulate").mockImplementation(mockSimulate);
jest.spyOn(SorobanRpcClient.prototype, "submitTransaction").mockImplementation(mockSubmit);
jest.spyOn(SorobanRpcClient.prototype, "getPositions").mockImplementation(mockGetPositions);
jest.spyOn(SorobanRpcClient.prototype, "getPoolYield").mockImplementation(mockGetPoolYield);
jest.spyOn(SorobanRpcClient.prototype, "getHealth").mockImplementation(mockGetHealth);
jest.spyOn(SorobanRpcClient.prototype, "callReadOnly").mockResolvedValue([]);

function makeClient(overrides?: Partial<LpSuiteConfig>): LpSuiteClient {
  return new LpSuiteClient({
    contractId: "CA_TEST",
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    account: "GABC123",
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    ...overrides,
  });
}

describe("LpSuiteClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulate.mockResolvedValue({ estimatedFee: "100", willSucceed: true });
    mockSubmit.mockResolvedValue({ txHash: "client-tx-hash" });
    mockGetPositions.mockResolvedValue([
      { poolId: "pool-a", shares: "1000", costBasis: "1000", lastCompoundTs: 0 },
    ]);
  });

  it("throws on missing required config", () => {
    expect(() =>
      new LpSuiteClient({} as LpSuiteConfig)
    ).toThrow(LpSuiteError);
  });

  it("deposit() returns txHash and positions", async () => {
    const client = makeClient();
    const result = await client.deposit({
      allocations: [{ poolId: "pool-a", amount: "1000" }],
    });
    expect(result.txHash).toBe("client-tx-hash");
    expect(result.positions[0].poolId).toBe("pool-a");
  });

  it("withdraw() returns txHash and positions", async () => {
    const client = makeClient();
    const result = await client.withdraw({
      allocations: [{ poolId: "pool-a", amount: "400" }],
    });
    expect(result.txHash).toBe("client-tx-hash");
  });

  it("rebalance() validates weights", async () => {
    const client = makeClient();
    await expect(
      client.rebalance({ targetWeights: { "pool-a": 1.2 } })
    ).rejects.toMatchObject({ code: "INVALID_WEIGHTS" });
  });

  it("compound() returns txHash and positions", async () => {
    const client = makeClient();
    const result = await client.compound({ poolIds: ["pool-a"] });
    expect(result.txHash).toBe("client-tx-hash");
  });

  it("simulate.rebalance() validates weights without submitting", async () => {
    const client = makeClient();
    await expect(
      client.simulate.rebalance({ targetWeights: { "pool-a": 0.5, "pool-b": 0.5 } })
    ).resolves.toMatchObject({ willSucceed: true });

    // No transaction submitted
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("simulate.rebalance() throws INVALID_WEIGHTS for bad weights", async () => {
    const client = makeClient();
    await expect(
      client.simulate.rebalance({ targetWeights: { "pool-a": 0.3 } })
    ).rejects.toMatchObject({ code: "INVALID_WEIGHTS" });
  });

  it("compareYields() returns yield entries", async () => {
    const client = makeClient();
    const yields = await client.compareYields(["pool-a"]);
    expect(yields).toHaveLength(1);
    expect(yields[0].poolId).toBe("pool-a");
  });

  it("getPositionHealth() returns health entries", async () => {
    const client = makeClient();
    const health = await client.getPositionHealth("GABC123");
    expect(health).toHaveLength(1);
    expect(health[0].poolId).toBe("pool-a");
    expect(health[0].alerts).toContain("IL_THRESHOLD_WARNING");
  });

  it("onAlert() returns an unsubscribe function", () => {
    const client = makeClient();
    const unsub = client.onAlert(() => {});
    expect(typeof unsub).toBe("function");
    // calling it should not throw
    expect(() => unsub()).not.toThrow();
  });
});

/**
 * Unit tests for the SDK rebalance flow.
 * RPC layer is mocked — no live network calls, per README "SDK Tests".
 */

import { rebalance } from "../../src/core/rebalance";
import { LpSuiteError, LpSuiteConfig } from "../../src/types";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

function makeMockRpc(overrides?: Partial<SorobanRpcClient>): SorobanRpcClient {
  const base = {
    simulate: jest.fn().mockResolvedValue({ estimatedFee: "100", willSucceed: true }),
    submitTransaction: jest.fn().mockResolvedValue({ txHash: "mock-rebalance-hash" }),
    callReadOnly: jest.fn().mockResolvedValue([]),
    getPositions: jest.fn().mockResolvedValue([
      { poolId: "pool-a", shares: "5000", costBasis: "5000", lastCompoundTs: 0 },
      { poolId: "pool-b", shares: "5000", costBasis: "5000", lastCompoundTs: 0 },
    ]),
    getPoolYield: jest.fn(),
    getHealth: jest.fn(),
  };
  return Object.assign(Object.create(SorobanRpcClient.prototype), base, overrides);
}

function makeConfig(): LpSuiteConfig {
  return {
    contractId: "CA_TEST",
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    account: "GABC123",
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
  };
}

describe("rebalance", () => {
  it("returns txHash and updated positions on success", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    const result = await rebalance(config, rpc, {
      targetWeights: { "pool-a": 0.5, "pool-b": 0.5 },
    });

    expect(result.txHash).toBe("mock-rebalance-hash");
    expect(result.positions).toHaveLength(2);
  });

  it("throws INVALID_WEIGHTS when weights sum > 1.0", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    await expect(
      rebalance(config, rpc, {
        targetWeights: { "pool-a": 0.6, "pool-b": 0.6 },
      })
    ).rejects.toMatchObject({ code: "INVALID_WEIGHTS" });
  });

  it("throws INVALID_WEIGHTS when weights sum < 1.0", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    await expect(
      rebalance(config, rpc, {
        targetWeights: { "pool-a": 0.3, "pool-b": 0.3 },
      })
    ).rejects.toMatchObject({ code: "INVALID_WEIGHTS" });
  });

  it("throws INVALID_WEIGHTS when the error is an LpSuiteError instance", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    try {
      await rebalance(config, rpc, {
        targetWeights: { "pool-a": 1.2 },
      });
      fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(LpSuiteError);
      expect((err as LpSuiteError).code).toBe("INVALID_WEIGHTS");
    }
  });

  it("converts decimal weights to basis points before calling contract", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    await rebalance(config, rpc, {
      targetWeights: { "pool-a": 0.8, "pool-b": 0.2 },
    });

    // The simulate call's second arg should be the bps weights map
    const simulateArgs = (rpc.simulate as jest.Mock).mock.calls[0];
    expect(simulateArgs[0]).toBe("rebalance");
    const bpsWeights = simulateArgs[1][1] as Record<string, number>;
    expect(bpsWeights["pool-a"]).toBe(8000);
    expect(bpsWeights["pool-b"]).toBe(2000);
  });

  it("simulates before signing", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();
    const sign = config.signTransaction as jest.Mock;

    await rebalance(config, rpc, {
      targetWeights: { "pool-a": 0.5, "pool-b": 0.5 },
    });

    const simOrder = (rpc.simulate as jest.Mock).mock.invocationCallOrder[0];
    const signOrder = sign.mock.invocationCallOrder[0];
    expect(simOrder).toBeLessThan(signOrder);
  });
});

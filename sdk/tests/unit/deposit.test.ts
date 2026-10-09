/**
 * Unit tests for the SDK deposit flow.
 * RPC layer is mocked — no live network calls, per README "SDK Tests".
 */

import { deposit } from "../../src/core/deposit";
import { LpSuiteConfig } from "../../src/types";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

// ─── Mock RPC client ──────────────────────────────────────────────────────────

function makeMockRpc(overrides?: Partial<SorobanRpcClient>): SorobanRpcClient {
  const base = {
    simulate: jest.fn().mockResolvedValue({ estimatedFee: "100", willSucceed: true }),
    submitTransaction: jest.fn().mockResolvedValue({ txHash: "mock-tx-hash" }),
    callReadOnly: jest.fn().mockResolvedValue([]),
    getPositions: jest.fn().mockResolvedValue([
      { poolId: "pool-a", shares: "1000", costBasis: "1000", lastCompoundTs: 0 },
    ]),
    getPoolYield: jest.fn(),
    getHealth: jest.fn(),
  };
  return Object.assign(Object.create(SorobanRpcClient.prototype), base, overrides);
}

function makeConfig(overrides?: Partial<LpSuiteConfig>): LpSuiteConfig {
  return {
    contractId: "CA_TEST",
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    account: "GABC123",
    signTransaction: jest.fn().mockResolvedValue("signed-xdr"),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("deposit", () => {
  it("returns txHash and positions on success", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    const result = await deposit(config, rpc, {
      allocations: [{ poolId: "pool-a", amount: "1000" }],
    });

    expect(result.txHash).toBe("mock-tx-hash");
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].poolId).toBe("pool-a");
  });

  it("calls simulate before signing", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();
    const sign = config.signTransaction as jest.Mock;

    await deposit(config, rpc, {
      allocations: [{ poolId: "pool-a", amount: "500" }],
    });

    expect(rpc.simulate).toHaveBeenCalled();
    expect(sign).toHaveBeenCalled();
    // simulate must be called before sign
    const simOrder = (rpc.simulate as jest.Mock).mock.invocationCallOrder[0];
    const signOrder = sign.mock.invocationCallOrder[0];
    expect(simOrder).toBeLessThan(signOrder);
  });

  it("splits oversized allocation batches into multiple txs", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    // 12 pools → 2 batches (MAX_POOLS_PER_TX = 10)
    const allocations = Array.from({ length: 12 }, (_, i) => ({
      poolId: `pool-${i}`,
      amount: "100",
    }));

    await deposit(config, rpc, { allocations });

    // simulate called twice (once per batch)
    expect(rpc.simulate).toHaveBeenCalledTimes(2);
    expect(rpc.submitTransaction).toHaveBeenCalledTimes(2);
  });

  it("throws SIMULATION_FAILED when simulation rejects", async () => {
    const rpc = makeMockRpc({
      simulate: jest.fn().mockResolvedValue({
        estimatedFee: "0",
        willSucceed: false,
        error: "pool not registered",
      }),
    });
    const config = makeConfig();

    await expect(
      deposit(config, rpc, { allocations: [{ poolId: "bad-pool", amount: "100" }] })
    ).rejects.toMatchObject({ code: "SIMULATION_FAILED" });
  });
});

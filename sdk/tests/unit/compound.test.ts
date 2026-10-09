/**
 * Unit tests for the SDK compound flow.
 * RPC layer is mocked — no live network calls, per README "SDK Tests".
 */

import { compound } from "../../src/core/compound";
import { LpSuiteConfig } from "../../src/types";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

function makeMockRpc(overrides?: Partial<SorobanRpcClient>): SorobanRpcClient {
  const base = {
    simulate: jest.fn().mockResolvedValue({ estimatedFee: "100", willSucceed: true }),
    submitTransaction: jest.fn().mockResolvedValue({ txHash: "mock-compound-hash" }),
    callReadOnly: jest.fn().mockResolvedValue([]),
    getPositions: jest.fn().mockResolvedValue([
      { poolId: "pool-a", shares: "1100", costBasis: "1100", lastCompoundTs: 1000 },
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

describe("compound", () => {
  it("returns txHash and positions on success", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    const result = await compound(config, rpc, { poolIds: ["pool-a"] });

    expect(result.txHash).toBe("mock-compound-hash");
    expect(result.positions).toHaveLength(1);
  });

  it("simulates before signing", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();
    const sign = config.signTransaction as jest.Mock;

    await compound(config, rpc, { poolIds: ["pool-a"] });

    const simOrder = (rpc.simulate as jest.Mock).mock.invocationCallOrder[0];
    const signOrder = sign.mock.invocationCallOrder[0];
    expect(simOrder).toBeLessThan(signOrder);
  });

  it("splits pool lists exceeding MAX_POOLS_PER_TX into multiple txs", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    const poolIds = Array.from({ length: 11 }, (_, i) => `pool-${i}`);
    await compound(config, rpc, { poolIds });

    expect(rpc.simulate).toHaveBeenCalledTimes(2);
    expect(rpc.submitTransaction).toHaveBeenCalledTimes(2);
  });

  it("passes compound method name to simulate", async () => {
    const rpc = makeMockRpc();
    const config = makeConfig();

    await compound(config, rpc, { poolIds: ["pool-a"] });

    expect(rpc.simulate).toHaveBeenCalledWith("compound", expect.any(Array));
  });
});

/**
 * Unit tests for compareYields().
 * RPC layer mocked — no live network calls.
 */

import { compareYields } from "../../src/analytics/yieldCompare";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

function makeMockRpc(yields: Record<string, object>): SorobanRpcClient {
  const base = {
    getPoolYield: jest.fn().mockImplementation((poolId: string) => {
      return Promise.resolve(
        yields[poolId] ?? {
          poolId,
          apy: 0,
          tvl: "0",
          rewardToken: "XLM",
          feeTierBps: 0,
        }
      );
    }),
  };
  return Object.assign(Object.create(SorobanRpcClient.prototype), base);
}

describe("compareYields", () => {
  it("returns one entry per pool in the same order", async () => {
    const rpc = makeMockRpc({
      "pool-a": { poolId: "pool-a", apy: 0.184, tvl: "1200000", rewardToken: "XLM", feeTierBps: 30 },
      "pool-b": { poolId: "pool-b", apy: 0.097, tvl: "3400000", rewardToken: "XLM", feeTierBps: 5 },
      "pool-c": { poolId: "pool-c", apy: 0.223, tvl: "410000",  rewardToken: "USDC", feeTierBps: 100 },
    });

    const results = await compareYields(rpc, ["pool-a", "pool-b", "pool-c"]);

    expect(results).toHaveLength(3);
    expect(results[0].poolId).toBe("pool-a");
    expect(results[1].poolId).toBe("pool-b");
    expect(results[2].poolId).toBe("pool-c");
  });

  it("returns the normalized shape from README Yield Comparison example", async () => {
    const rpc = makeMockRpc({
      "pool-a": { poolId: "pool-a", apy: 0.184, tvl: "1200000", rewardToken: "XLM", feeTierBps: 30 },
    });

    const [entry] = await compareYields(rpc, ["pool-a"]);

    expect(entry).toMatchObject({
      poolId: "pool-a",
      apy: 0.184,
      tvl: "1200000",
      rewardToken: "XLM",
      feeTierBps: 30,
    });
  });

  it("fetches pools in parallel (all getPoolYield calls started)", async () => {
    const getPoolYield = jest.fn().mockResolvedValue({
      poolId: "x",
      apy: 0,
      tvl: "0",
      rewardToken: "XLM",
      feeTierBps: 0,
    });
    const rpc = Object.assign(Object.create(SorobanRpcClient.prototype), {
      getPoolYield,
    });

    await compareYields(rpc, ["p1", "p2", "p3"]);
    expect(getPoolYield).toHaveBeenCalledTimes(3);
  });

  it("returns an empty array for an empty poolIds list", async () => {
    const rpc = makeMockRpc({});
    const results = await compareYields(rpc, []);
    expect(results).toEqual([]);
  });
});

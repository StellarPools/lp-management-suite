/**
 * Unit tests for getPositionHealth() and the alert emitter.
 * RPC layer mocked — no live network calls.
 */

import { getPositionHealth } from "../../src/analytics/health";
import { AlertEmitter } from "../../src/alerts/alertEmitter";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

// ─── Health tests ─────────────────────────────────────────────────────────────

function makeHealthRpc(
  positions: object[],
  healthMap: Record<string, object>
): SorobanRpcClient {
  return Object.assign(Object.create(SorobanRpcClient.prototype), {
    getPositions: jest.fn().mockResolvedValue(positions),
    getHealth: jest.fn().mockImplementation((_account: string, poolId: string) =>
      Promise.resolve(
        healthMap[poolId] ?? {
          poolId,
          impermanentLossPct: 0,
          utilization: 0,
          concentrationPct: 0,
          alerts: [],
        }
      )
    ),
  });
}

describe("getPositionHealth", () => {
  it("returns health for all user positions", async () => {
    const rpc = makeHealthRpc(
      [
        { poolId: "pool-a", shares: "1000", costBasis: "1000", lastCompoundTs: 0 },
        { poolId: "pool-b", shares: "2000", costBasis: "2000", lastCompoundTs: 0 },
      ],
      {
        "pool-a": {
          poolId: "pool-a",
          impermanentLossPct: 2.1,
          utilization: 0.78,
          concentrationPct: 0.61,
          alerts: ["IL_THRESHOLD_WARNING"],
        },
        "pool-b": {
          poolId: "pool-b",
          impermanentLossPct: 0.5,
          utilization: 0.3,
          concentrationPct: 0.39,
          alerts: [],
        },
      }
    );

    const results = await getPositionHealth(rpc, "GABC123");
    expect(results).toHaveLength(2);
  });

  it("returns the shape from README Position Health & Alerts example", async () => {
    const rpc = makeHealthRpc(
      [{ poolId: "pool-a", shares: "1000", costBasis: "1000", lastCompoundTs: 0 }],
      {
        "pool-a": {
          poolId: "pool-a",
          impermanentLossPct: 2.1,
          utilization: 0.78,
          concentrationPct: 0.61,
          alerts: ["IL_THRESHOLD_WARNING"],
        },
      }
    );

    const [health] = await getPositionHealth(rpc, "GABC123");
    expect(health).toMatchObject({
      poolId: "pool-a",
      impermanentLossPct: 2.1,
      utilization: 0.78,
      concentrationPct: 0.61,
      alerts: ["IL_THRESHOLD_WARNING"],
    });
  });

  it("returns empty array when account has no positions", async () => {
    const rpc = makeHealthRpc([], {});
    const results = await getPositionHealth(rpc, "GEMPTY");
    expect(results).toEqual([]);
  });
});

// ─── Alert emitter tests ──────────────────────────────────────────────────────

describe("AlertEmitter", () => {
  it("subscribe returns a function", () => {
    const rpc = makeHealthRpc([], {});
    const emitter = new AlertEmitter(rpc, "GABC", 30_000);
    const unsub = emitter.subscribe(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("calling unsubscribe does not throw", () => {
    const rpc = makeHealthRpc([], {});
    const emitter = new AlertEmitter(rpc, "GABC", 30_000);
    const unsub = emitter.subscribe(() => {});
    expect(() => unsub()).not.toThrow();
  });

  it("multiple subscribers receive the same alert", async () => {
    // Drive polling manually by reducing interval and triggering a tick
    const rpc = makeHealthRpc(
      [{ poolId: "pool-a", shares: "1000", costBasis: "1000", lastCompoundTs: 0 }],
      {
        "pool-a": {
          poolId: "pool-a",
          impermanentLossPct: 10.0, // above default threshold
          utilization: 0.1,
          concentrationPct: 0.1,
          alerts: [],
        },
      }
    );

    const alerts1: object[] = [];
    const alerts2: object[] = [];

    const emitter = new AlertEmitter(rpc, "GABC", 999_999);
    const unsub1 = emitter.subscribe((a) => alerts1.push(a));
    const unsub2 = emitter.subscribe((a) => alerts2.push(a));

    // Trigger an internal poll directly (accessing private method via cast).
    await (emitter as unknown as { poll(): Promise<void> }).poll();

    expect(alerts1.length).toBeGreaterThan(0);
    expect(alerts2.length).toEqual(alerts1.length);

    unsub1();
    unsub2();
  });
});

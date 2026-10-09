/**
 * Unit tests for exportHistoryCsv().
 * RPC layer mocked — no live network calls.
 */

import { exportHistoryCsv } from "../../src/export/csvExport";
import { SorobanRpcClient } from "../../src/rpc/sorobanRpcClient";

const SAMPLE_EVENTS = [
  {
    date: "2025-03-15",
    tx_hash: "abc123",
    pool_id: "pool-a",
    action: "deposit",
    amount: "1000",
    token: "XLM",
    reward_amount: "0",
    reward_token: "XLM",
    cost_basis: "1000",
    realized_gain: "0",
  },
  {
    date: "2025-06-01",
    tx_hash: "def456",
    pool_id: "pool-a",
    action: "compound",
    amount: "50",
    token: "XLM",
    reward_amount: "50",
    reward_token: "XLM",
    cost_basis: "1050",
    realized_gain: "0",
  },
];

function makeMockRpc(events: object[]): SorobanRpcClient {
  return Object.assign(Object.create(SorobanRpcClient.prototype), {
    callReadOnly: jest.fn().mockResolvedValue(events),
  });
}

describe("exportHistoryCsv", () => {
  it("produces a CSV with the exact column header from README", async () => {
    const rpc = makeMockRpc(SAMPLE_EVENTS);
    const csv = await exportHistoryCsv(rpc, {
      account: "GABC",
      from: "2025-01-01",
      to: "2025-12-31",
    });

    const lines = csv.split("\n");
    expect(lines[0]).toBe(
      "date,txHash,poolId,action,amount,token,rewardAmount,rewardToken,costBasis,realizedGain"
    );
  });

  it("produces one data row per event", async () => {
    const rpc = makeMockRpc(SAMPLE_EVENTS);
    const csv = await exportHistoryCsv(rpc, {
      account: "GABC",
      from: "2025-01-01",
      to: "2025-12-31",
    });

    const lines = csv.split("\n");
    // header + 2 data rows
    expect(lines).toHaveLength(3);
  });

  it("returns header-only CSV when there are no events", async () => {
    const rpc = makeMockRpc([]);
    const csv = await exportHistoryCsv(rpc, {
      account: "GABC",
      from: "2025-01-01",
      to: "2025-12-31",
    });

    const lines = csv.split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("date");
  });

  it("escapes commas in field values", async () => {
    const rpc = makeMockRpc([
      {
        ...SAMPLE_EVENTS[0],
        pool_id: "pool,with,commas",
      },
    ]);
    const csv = await exportHistoryCsv(rpc, {
      account: "GABC",
      from: "2025-01-01",
      to: "2025-12-31",
    });

    expect(csv).toContain('"pool,with,commas"');
  });

  it("includes all 10 README columns in each data row", async () => {
    const rpc = makeMockRpc([SAMPLE_EVENTS[0]]);
    const csv = await exportHistoryCsv(rpc, {
      account: "GABC",
      from: "2025-01-01",
      to: "2025-12-31",
    });

    const lines = csv.split("\n");
    const dataRow = lines[1].split(",");
    expect(dataRow).toHaveLength(10);
  });
});

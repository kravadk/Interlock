import { describe, expect, it } from "vitest";
import {
  buildReasonRows,
  buildStats,
  buildTableRows,
  compareRows,
  short,
  type RecordRow,
} from "./dashboard-data";
import type { IndexerAction } from "./indexer";

function action(over: Partial<IndexerAction> = {}): IndexerAction {
  return {
    actionCheckId: "1",
    agentId: "1",
    policyId: "1",
    target: "0x0000000000000000000000000000000000000001",
    value: "0",
    calldataHash: `0x${"a".repeat(64)}`,
    selector: "0x2de5aaf7",
    simulationHash: `0x${"b".repeat(64)}`,
    decision: "ALLOW",
    reasonCode: "POLICY_PASSED",
    timestamp: "1700000000",
    transactionHash: `0x${"c".repeat(64)}`,
    blockNumber: "100",
    ...over,
  };
}

describe("short", () => {
  it("returns 'none' for undefined", () => {
    expect(short(undefined)).toBe("none");
  });
  it("truncates long values", () => {
    expect(short(`0x${"d".repeat(40)}`)).toMatch(/^0x.{4}….{4}$/);
  });
  it("leaves short values intact", () => {
    expect(short("0xabcd")).toBe("0xabcd");
  });
});

describe("buildReasonRows", () => {
  it("counts reason codes and sorts descending", () => {
    const rows = buildReasonRows([
      action({ reasonCode: "TARGET_NOT_ALLOWED", decision: "BLOCK" }),
      action({ reasonCode: "TARGET_NOT_ALLOWED", decision: "BLOCK" }),
      action({ reasonCode: "POLICY_PASSED" }),
    ]);
    expect(rows[0]).toMatchObject({ reason: "TARGET_NOT_ALLOWED", count: 2 });
    expect(rows[1]).toMatchObject({ reason: "POLICY_PASSED", count: 1 });
    expect(rows[0].color).toMatch(/^#/);
  });
  it("returns empty for no actions", () => {
    expect(buildReasonRows([])).toEqual([]);
  });
});

describe("buildStats", () => {
  it("derives counts, block rate and last decision", () => {
    const stats = buildStats(
      [action(), action({ decision: "BLOCK", reasonCode: "VALUE_LIMIT_EXCEEDED" })],
      [{ agentId: "1" } as never],
      [{ policyId: "1" } as never],
      { decision: "BLOCK", reason: "VALUE_LIMIT_EXCEEDED", allowed: false } as never,
    );
    const byLabel = Object.fromEntries(stats.map((s) => [s.label, s]));
    expect(byLabel["Indexed Actions"].value).toBe("2");
    expect(byLabel["Blocked Actions"].value).toBe("1");
    expect(byLabel["Blocked Actions"].delta).toContain("50%");
    expect(byLabel["Last Decision"].value).toBe("BLOCK");
    expect(byLabel["Last Decision"].dir).toBe("down");
  });
});

describe("buildTableRows", () => {
  it("emits action, agent, policy and ecosystem rows with dispute status", () => {
    const rows = buildTableRows(
      [action({ status: "ACTIVE" })],
      [{ agentId: "1", totalActions: 1 } as never],
      [{ policyId: "1", allowedTargets: ["0x1"], active: true } as never],
    );
    const types = new Set(rows.map((r) => r.type));
    expect(types).toContain("Action");
    expect(types).toContain("Agent");
    expect(types).toContain("Policy");
    expect(types).toContain("Mantle");
    const actionRow = rows.find((r) => r.type === "Action")!;
    expect(actionRow.dispute).toBe("ACTIVE");
    expect(actionRow.sym).toBe("OK");
  });
});

describe("compareRows", () => {
  const a = { rank: 1 } as RecordRow;
  const b = { rank: 2 } as RecordRow;
  it("sorts ascending and descending by column", () => {
    expect(compareRows(a, b, { col: "rank", dir: "asc" })).toBeLessThan(0);
    expect(compareRows(a, b, { col: "rank", dir: "desc" })).toBeGreaterThan(0);
  });
});

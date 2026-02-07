import { describe, expect, it } from "vitest";
import { SimpleWrongTurnMiner } from "../src/core/miner.js";
import type { TraceEvent } from "../src/core/types.js";

function event(overrides: Partial<TraceEvent>): TraceEvent {
  return {
    id: overrides.id ?? "evt",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    sessionId: overrides.sessionId ?? "session-1",
    harness: overrides.harness ?? "pi",
    scope: overrides.scope ?? "personal",
    type: overrides.type ?? "tool_result",
    payload: overrides.payload ?? {},
    metrics: overrides.metrics,
    tags: overrides.tags,
    actorId: overrides.actorId,
    agentId: overrides.agentId,
  };
}

describe("SimpleWrongTurnMiner", () => {
  it("finds a wrong-turn correction arc", async () => {
    const miner = new SimpleWrongTurnMiner();

    await miner.ingest(
      event({
        id: "fail-1",
        payload: {
          command: "npm run test",
          isError: true,
          output: "FAIL: Cannot find module x",
        },
        metrics: { outcome: "failure" },
      }),
    );

    await miner.ingest(
      event({
        id: "success-1",
        payload: {
          command: "npm run test -- --runInBand",
          isError: false,
          output: "PASS",
        },
        metrics: { outcome: "success" },
      }),
    );

    const artifacts = await miner.mine();

    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    const first = artifacts.at(0);
    expect(first?.kind).toBe("wrong_turn_fix");
    expect(first?.evidenceEventIds).toEqual(["fail-1", "success-1"]);
  });
});

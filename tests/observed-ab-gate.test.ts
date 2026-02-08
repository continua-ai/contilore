import { describe, expect, it } from "vitest";
import {
  buildObservedAbPairs,
  evaluateObservedAbGate,
  extractObservedAbEpisodes,
} from "../src/core/observedAbGate.js";
import type { TraceEvent } from "../src/core/types.js";

function event(
  input: Partial<TraceEvent> & {
    type: TraceEvent["type"];
    payload: Record<string, unknown>;
  },
): TraceEvent {
  return {
    id: input.id ?? "event-id",
    timestamp: input.timestamp ?? "2026-03-01T00:00:00.000Z",
    sessionId: input.sessionId ?? "session-1",
    harness: input.harness ?? "pi",
    scope: input.scope ?? "personal",
    type: input.type,
    payload: input.payload,
    metrics: input.metrics,
    agentId: input.agentId,
    actorId: input.actorId,
    tags: input.tags,
  };
}

describe("observed A/B gate", () => {
  it("extracts cross-session pairs and computes measured reductions", () => {
    const events: TraceEvent[] = [
      event({
        id: "a-f1",
        sessionId: "session-a",
        timestamp: "2026-03-01T00:00:01.000Z",
        type: "tool_result",
        payload: {
          command: "npm run test",
          output: "Error: Cannot find module x",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 30_000,
          tokens: {
            inputUncached: 1200,
            output: 200,
          },
        },
      }),
      event({
        id: "a-f2",
        sessionId: "session-a",
        timestamp: "2026-03-01T00:00:40.000Z",
        type: "tool_result",
        payload: {
          command: "npm run test",
          output: "Error: Cannot find module x",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 20_000,
          tokens: {
            inputUncached: 800,
            output: 140,
          },
        },
      }),
      event({
        id: "a-s1",
        sessionId: "session-a",
        timestamp: "2026-03-01T00:01:10.000Z",
        type: "tool_result",
        payload: {
          command: "npm run test -- --runInBand",
          output: "PASS",
          isError: false,
        },
        metrics: {
          outcome: "success",
          latencyMs: 25_000,
          tokens: {
            inputUncached: 600,
            output: 100,
          },
        },
      }),
      event({
        id: "b-f1",
        sessionId: "session-b",
        timestamp: "2026-03-02T00:00:01.000Z",
        type: "tool_result",
        payload: {
          command: "npm run test",
          output: "Error: Cannot find module x",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 10_000,
          tokens: {
            inputUncached: 500,
            output: 80,
          },
        },
      }),
      event({
        id: "b-s1",
        sessionId: "session-b",
        timestamp: "2026-03-02T00:00:20.000Z",
        type: "tool_result",
        payload: {
          command: "npm run test -- --runInBand",
          output: "PASS",
          isError: false,
        },
        metrics: {
          outcome: "success",
          latencyMs: 9_000,
          tokens: {
            inputUncached: 450,
            output: 70,
          },
        },
      }),
      event({
        id: "c-f1",
        sessionId: "session-c",
        timestamp: "2026-03-03T00:00:01.000Z",
        type: "tool_result",
        payload: {
          command: "chmod +x scripts/run.sh",
          output: "permission denied",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 4_000,
        },
      }),
      event({
        id: "c-s1",
        sessionId: "session-c",
        timestamp: "2026-03-03T00:00:08.000Z",
        type: "tool_result",
        payload: {
          command: "chmod +x scripts/run.sh",
          output: "ok",
          isError: false,
        },
        metrics: {
          outcome: "success",
          latencyMs: 3_000,
        },
      }),
    ];

    const episodes = extractObservedAbEpisodes(events);
    expect(episodes.length).toBe(3);

    const pairs = buildObservedAbPairs(episodes, {
      minOccurrencesPerFamily: 2,
      requireCrossSession: true,
    });
    expect(pairs.length).toBe(1);

    const report = evaluateObservedAbGate(
      episodes,
      {
        minPairCount: 1,
        minRelativeDeadEndReduction: 0.2,
        minRelativeWallTimeReduction: 0.1,
        minRelativeTokenCountReduction: 0.1,
        minRelativeTokenProxyReduction: 0.1,
      },
      {
        minOccurrencesPerFamily: 2,
        requireCrossSession: true,
      },
      {
        bootstrapSamples: 500,
        confidenceLevel: 0.9,
        seed: 7,
      },
    );

    expect(report.aggregate.totalPairs).toBe(1);
    expect(report.aggregate.totalRetriesOff).toBe(2);
    expect(report.aggregate.totalRetriesOn).toBe(1);
    expect(report.aggregate.relativeWallTimeReduction).toBeGreaterThan(0.7);
    expect(report.aggregate.relativeTokenCountReduction).toBeGreaterThan(0.6);
    expect(report.gateResult.pass).toBe(true);
    expect(report.trustSummary.sampleCount).toBe(500);
  });

  it("can require cross-session pairing", () => {
    const events: TraceEvent[] = [
      event({
        id: "s1-f1",
        sessionId: "session-only",
        timestamp: "2026-03-01T00:00:01.000Z",
        type: "tool_result",
        payload: {
          command: "npm run lint",
          output: "Error: lint failure",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 2_000,
        },
      }),
      event({
        id: "s1-s1",
        sessionId: "session-only",
        timestamp: "2026-03-01T00:00:04.000Z",
        type: "tool_result",
        payload: {
          command: "npm run lint --fix",
          output: "ok",
          isError: false,
        },
        metrics: {
          outcome: "success",
          latencyMs: 1_000,
        },
      }),
      event({
        id: "s1-f2",
        sessionId: "session-only",
        timestamp: "2026-03-01T00:01:01.000Z",
        type: "tool_result",
        payload: {
          command: "npm run lint",
          output: "Error: lint failure",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 2_000,
        },
      }),
      event({
        id: "s1-s2",
        sessionId: "session-only",
        timestamp: "2026-03-01T00:01:04.000Z",
        type: "tool_result",
        payload: {
          command: "npm run lint --fix",
          output: "ok",
          isError: false,
        },
        metrics: {
          outcome: "success",
          latencyMs: 1_000,
        },
      }),
    ];

    const episodes = extractObservedAbEpisodes(events);
    expect(episodes.length).toBe(2);

    const crossSessionPairs = buildObservedAbPairs(episodes, {
      minOccurrencesPerFamily: 2,
      requireCrossSession: true,
    });
    expect(crossSessionPairs.length).toBe(0);

    const sameSessionPairs = buildObservedAbPairs(episodes, {
      minOccurrencesPerFamily: 2,
      requireCrossSession: false,
    });
    expect(sameSessionPairs.length).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  filterLongHorizonSessions,
  splitSessionsChronologically,
  summarizeFamilyOverlap,
  summarizeObservedAbSession,
} from "../src/core/observedAbBenchmark.js";
import type { ObservedAbEpisode } from "../src/core/observedAbGate.js";
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

function episode(
  input: Partial<ObservedAbEpisode> & {
    id: string;
    familySignature: string;
  },
): ObservedAbEpisode {
  return {
    id: input.id,
    familySignature: input.familySignature,
    description: input.description ?? "Recover from test failure",
    sessionId: input.sessionId ?? "session-1",
    startedAt: input.startedAt ?? "2026-03-01T00:00:00.000Z",
    endedAt: input.endedAt ?? "2026-03-01T00:01:00.000Z",
    outcome: input.outcome ?? {
      wallTimeMs: 1000,
      retries: 1,
      success: true,
      costUsd: 0,
      tokens: {},
    },
    tokenCount: input.tokenCount ?? 100,
    tokenProxy: input.tokenProxy ?? 100,
  };
}

describe("observed A/B benchmark helpers", () => {
  it("summarizes session totals from trace events", () => {
    const events: TraceEvent[] = [
      event({
        id: "e1",
        timestamp: "2026-03-01T10:00:00.000Z",
        type: "tool_result",
        payload: { command: "npm run test", isError: true },
        metrics: {
          latencyMs: 3000,
          cost: { usd: 0.1 },
          tokens: {
            inputUncached: 100,
            output: 20,
          },
        },
      }),
      event({
        id: "e2",
        timestamp: "2026-03-01T10:10:00.000Z",
        type: "tool_result",
        payload: { command: "npm run test -- --runInBand", isError: false },
        metrics: {
          latencyMs: 2000,
          cost: { usd: 0.08 },
          tokens: {
            inputUncached: 80,
            output: 12,
          },
        },
      }),
    ];

    const summary = summarizeObservedAbSession(
      "session-1",
      "/tmp/session-1.jsonl",
      events,
    );

    expect(summary.durationMs).toBe(10 * 60 * 1000);
    expect(summary.toolResultCount).toBe(2);
    expect(summary.totalLatencyMs).toBe(5000);
    expect(summary.totalTokenCount).toBe(212);
    expect(summary.totalCostUsd).toBeCloseTo(0.18);
  });

  it("filters long-horizon sessions by duration/latency and tool count", () => {
    const sessions = [
      {
        sessionId: "short",
        traceFile: "short.jsonl",
        startedAt: "2026-03-01T10:00:00.000Z",
        endedAt: "2026-03-01T10:02:00.000Z",
        durationMs: 2 * 60 * 1000,
        eventCount: 4,
        toolResultCount: 2,
        totalLatencyMs: 20_000,
        totalTokenCount: 100,
        totalCostUsd: 0.02,
      },
      {
        sessionId: "long-duration",
        traceFile: "long-duration.jsonl",
        startedAt: "2026-03-01T11:00:00.000Z",
        endedAt: "2026-03-01T11:35:00.000Z",
        durationMs: 35 * 60 * 1000,
        eventCount: 25,
        toolResultCount: 10,
        totalLatencyMs: 50_000,
        totalTokenCount: 1000,
        totalCostUsd: 0.4,
      },
      {
        sessionId: "long-latency",
        traceFile: "long-latency.jsonl",
        startedAt: "2026-03-01T12:00:00.000Z",
        endedAt: "2026-03-01T12:10:00.000Z",
        durationMs: 10 * 60 * 1000,
        eventCount: 30,
        toolResultCount: 12,
        totalLatencyMs: 12 * 60 * 1000,
        totalTokenCount: 2200,
        totalCostUsd: 0.8,
      },
    ];

    const filtered = filterLongHorizonSessions(sessions, {
      minSessionDurationMs: 20 * 60 * 1000,
      minTotalLatencyMs: 8 * 60 * 1000,
      minToolResultCount: 8,
    });

    expect(filtered.map((session) => session.sessionId)).toEqual([
      "long-duration",
      "long-latency",
    ]);
  });

  it("splits sessions chronologically into train/eval", () => {
    const sessions = [
      {
        sessionId: "s1",
        traceFile: "s1.jsonl",
        startedAt: "2026-03-01T10:00:00.000Z",
        endedAt: "2026-03-01T10:10:00.000Z",
        durationMs: 600000,
        eventCount: 10,
        toolResultCount: 5,
        totalLatencyMs: 1000,
        totalTokenCount: 100,
        totalCostUsd: 0,
      },
      {
        sessionId: "s2",
        traceFile: "s2.jsonl",
        startedAt: "2026-03-02T10:00:00.000Z",
        endedAt: "2026-03-02T10:10:00.000Z",
        durationMs: 600000,
        eventCount: 10,
        toolResultCount: 5,
        totalLatencyMs: 1000,
        totalTokenCount: 100,
        totalCostUsd: 0,
      },
      {
        sessionId: "s3",
        traceFile: "s3.jsonl",
        startedAt: "2026-03-03T10:00:00.000Z",
        endedAt: "2026-03-03T10:10:00.000Z",
        durationMs: 600000,
        eventCount: 10,
        toolResultCount: 5,
        totalLatencyMs: 1000,
        totalTokenCount: 100,
        totalCostUsd: 0,
      },
      {
        sessionId: "s4",
        traceFile: "s4.jsonl",
        startedAt: "2026-03-04T10:00:00.000Z",
        endedAt: "2026-03-04T10:10:00.000Z",
        durationMs: 600000,
        eventCount: 10,
        toolResultCount: 5,
        totalLatencyMs: 1000,
        totalTokenCount: 100,
        totalCostUsd: 0,
      },
    ];

    const split = splitSessionsChronologically(sessions, 0.25);

    expect(split.trainSessions.map((session) => session.sessionId)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(split.evalSessions.map((session) => session.sessionId)).toEqual(["s4"]);
  });

  it("summarizes train/eval family overlap", () => {
    const trainEpisodes = [
      episode({ id: "t1", familySignature: "npm run test error" }),
      episode({ id: "t2", familySignature: "chmod permission denied" }),
    ];
    const evalEpisodes = [
      episode({ id: "e1", familySignature: "npm run test error" }),
      episode({ id: "e2", familySignature: "pytest timeout" }),
    ];

    const overlap = summarizeFamilyOverlap(trainEpisodes, evalEpisodes);

    expect(overlap.trainFamilyCount).toBe(2);
    expect(overlap.evalFamilyCount).toBe(2);
    expect(overlap.overlappingFamilyCount).toBe(1);
    expect(overlap.overlapRateByEvalFamilies).toBe(0.5);
    expect(overlap.overlapRateByTrainFamilies).toBe(0.5);
    expect(overlap.overlappingFamilies).toEqual(["npm run test error"]);
  });
});

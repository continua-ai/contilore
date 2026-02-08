import type { ObservedAbEpisode } from "./observedAbGate.js";
import type { TraceEvent } from "./types.js";

export interface ObservedAbSessionSummary {
  sessionId: string;
  traceFile: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
  toolResultCount: number;
  totalLatencyMs: number;
  totalTokenCount: number;
  totalCostUsd: number;
}

export interface LongHorizonSessionFilterOptions {
  minSessionDurationMs?: number;
  minTotalLatencyMs?: number;
  minToolResultCount?: number;
}

export interface ChronologicalHoldoutSplit {
  trainSessions: ObservedAbSessionSummary[];
  evalSessions: ObservedAbSessionSummary[];
  evalRatio: number;
}

export interface ObservedAbFamilyOverlap {
  trainFamilyCount: number;
  evalFamilyCount: number;
  overlappingFamilyCount: number;
  overlapRateByEvalFamilies: number;
  overlapRateByTrainFamilies: number;
  overlappingFamilies: string[];
}

const DEFAULT_LONG_HORIZON_FILTERS: Required<LongHorizonSessionFilterOptions> = {
  minSessionDurationMs: 15 * 60 * 1000,
  minTotalLatencyMs: 5 * 60 * 1000,
  minToolResultCount: 8,
};

function parseTimestampMs(timestamp: string): number | null {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function totalTokenCount(event: TraceEvent): number {
  const tokens = event.metrics?.tokens;
  if (!tokens) {
    return 0;
  }

  return (
    (tokens.inputUncached ?? 0) +
    (tokens.inputCached ?? 0) +
    (tokens.output ?? 0) +
    (tokens.thinking ?? 0) +
    (tokens.cacheWrite ?? 0)
  );
}

function durationMsFromEvents(
  events: TraceEvent[],
  totalLatencyMs: number,
): {
  startedAt: string;
  endedAt: string;
  durationMs: number;
} {
  if (events.length === 0) {
    return {
      startedAt: "",
      endedAt: "",
      durationMs: 0,
    };
  }

  let startedAt = events[0]?.timestamp ?? "";
  let endedAt = startedAt;
  let minTimestampMs = parseTimestampMs(startedAt);
  let maxTimestampMs = minTimestampMs;

  for (const event of events) {
    if (event.timestamp < startedAt) {
      startedAt = event.timestamp;
      minTimestampMs = parseTimestampMs(startedAt);
    }
    if (event.timestamp > endedAt) {
      endedAt = event.timestamp;
      maxTimestampMs = parseTimestampMs(endedAt);
    }
  }

  if (minTimestampMs !== null && maxTimestampMs !== null) {
    return {
      startedAt,
      endedAt,
      durationMs: Math.max(0, maxTimestampMs - minTimestampMs),
    };
  }

  return {
    startedAt,
    endedAt,
    durationMs: Math.max(0, totalLatencyMs),
  };
}

export function summarizeObservedAbSession(
  sessionId: string,
  traceFile: string,
  events: TraceEvent[],
): ObservedAbSessionSummary {
  const totalLatencyMs = events.reduce((sum, event) => {
    return sum + (event.metrics?.latencyMs ?? 0);
  }, 0);
  const totalTokenCountValue = events.reduce((sum, event) => {
    return sum + totalTokenCount(event);
  }, 0);
  const totalCostUsd = events.reduce((sum, event) => {
    return sum + (event.metrics?.cost?.usd ?? 0);
  }, 0);
  const toolResultCount = events.filter((event) => event.type === "tool_result").length;

  const duration = durationMsFromEvents(events, totalLatencyMs);

  return {
    sessionId,
    traceFile,
    startedAt: duration.startedAt,
    endedAt: duration.endedAt,
    durationMs: duration.durationMs,
    eventCount: events.length,
    toolResultCount,
    totalLatencyMs,
    totalTokenCount: totalTokenCountValue,
    totalCostUsd,
  };
}

function normalizeLongHorizonFilters(
  options?: LongHorizonSessionFilterOptions,
): Required<LongHorizonSessionFilterOptions> {
  const minSessionDurationMs = Number.isFinite(options?.minSessionDurationMs)
    ? Math.max(0, options?.minSessionDurationMs ?? 0)
    : DEFAULT_LONG_HORIZON_FILTERS.minSessionDurationMs;
  const minTotalLatencyMs = Number.isFinite(options?.minTotalLatencyMs)
    ? Math.max(0, options?.minTotalLatencyMs ?? 0)
    : DEFAULT_LONG_HORIZON_FILTERS.minTotalLatencyMs;
  const minToolResultCount = Number.isFinite(options?.minToolResultCount)
    ? Math.max(1, Math.floor(options?.minToolResultCount ?? 1))
    : DEFAULT_LONG_HORIZON_FILTERS.minToolResultCount;

  return {
    minSessionDurationMs,
    minTotalLatencyMs,
    minToolResultCount,
  };
}

function sortSessionsByStart(
  summaries: ObservedAbSessionSummary[],
): ObservedAbSessionSummary[] {
  return [...summaries].sort((left, right) => {
    if (left.startedAt < right.startedAt) {
      return -1;
    }
    if (left.startedAt > right.startedAt) {
      return 1;
    }
    return left.sessionId < right.sessionId
      ? -1
      : left.sessionId > right.sessionId
        ? 1
        : 0;
  });
}

export function filterLongHorizonSessions(
  summaries: ObservedAbSessionSummary[],
  options?: LongHorizonSessionFilterOptions,
): ObservedAbSessionSummary[] {
  const filters = normalizeLongHorizonFilters(options);

  const filtered = summaries.filter((summary) => {
    if (summary.toolResultCount < filters.minToolResultCount) {
      return false;
    }

    const passesDuration = summary.durationMs >= filters.minSessionDurationMs;
    const passesLatency = summary.totalLatencyMs >= filters.minTotalLatencyMs;
    return passesDuration || passesLatency;
  });

  return sortSessionsByStart(filtered);
}

export function splitSessionsChronologically(
  sessions: ObservedAbSessionSummary[],
  evalRatio = 0.3,
): ChronologicalHoldoutSplit {
  const sorted = sortSessionsByStart(sessions);
  if (sorted.length <= 1) {
    return {
      trainSessions: sorted,
      evalSessions: [],
      evalRatio: Math.max(0, Math.min(1, evalRatio)),
    };
  }

  const normalizedRatio = Math.max(0.05, Math.min(0.95, evalRatio));
  const targetEvalCount = Math.max(1, Math.round(sorted.length * normalizedRatio));
  const evalCount = Math.min(sorted.length - 1, targetEvalCount);

  return {
    trainSessions: sorted.slice(0, sorted.length - evalCount),
    evalSessions: sorted.slice(sorted.length - evalCount),
    evalRatio: normalizedRatio,
  };
}

export function summarizeFamilyOverlap(
  trainEpisodes: ObservedAbEpisode[],
  evalEpisodes: ObservedAbEpisode[],
): ObservedAbFamilyOverlap {
  const trainFamilies = new Set(
    trainEpisodes.map((episode) => episode.familySignature),
  );
  const evalFamilies = new Set(evalEpisodes.map((episode) => episode.familySignature));

  const overlappingFamilies = [...evalFamilies].filter((family) => {
    return trainFamilies.has(family);
  });

  const overlapRateByEvalFamilies =
    evalFamilies.size === 0 ? 0 : overlappingFamilies.length / evalFamilies.size;
  const overlapRateByTrainFamilies =
    trainFamilies.size === 0 ? 0 : overlappingFamilies.length / trainFamilies.size;

  return {
    trainFamilyCount: trainFamilies.size,
    evalFamilyCount: evalFamilies.size,
    overlappingFamilyCount: overlappingFamilies.length,
    overlapRateByEvalFamilies,
    overlapRateByTrainFamilies,
    overlappingFamilies: [...overlappingFamilies].sort(),
  };
}

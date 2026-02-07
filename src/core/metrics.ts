import type { TokenUsage, TraceEvent } from "./types.js";

export interface RunOutcome {
  wallTimeMs: number;
  success: boolean;
  retries: number;
  costUsd: number;
  tokens: TokenUsage;
}

export interface SavingsReport {
  correctnessDelta: number;
  wallTimeMsSaved: number;
  costUsdSaved: number;
  tokenProxySaved: number;
}

export interface TokenWeights {
  inputUncached: number;
  inputCached: number;
  output: number;
  thinking: number;
  cacheWrite: number;
}

export const DEFAULT_TOKEN_WEIGHTS: TokenWeights = {
  inputUncached: 1,
  inputCached: 0.2,
  output: 1,
  thinking: 1,
  cacheWrite: 0.2,
};

export function tokenProxy(
  usage: TokenUsage,
  weights: TokenWeights = DEFAULT_TOKEN_WEIGHTS,
): number {
  const inputUncached = usage.inputUncached ?? 0;
  const inputCached = usage.inputCached ?? 0;
  const output = usage.output ?? 0;
  const thinking = usage.thinking ?? 0;
  const cacheWrite = usage.cacheWrite ?? 0;

  return (
    inputUncached * weights.inputUncached +
    inputCached * weights.inputCached +
    output * weights.output +
    thinking * weights.thinking +
    cacheWrite * weights.cacheWrite
  );
}

export function compareOutcomes(
  baseline: RunOutcome,
  candidate: RunOutcome,
): SavingsReport {
  const correctnessDelta = Number(candidate.success) - Number(baseline.success);

  return {
    correctnessDelta,
    wallTimeMsSaved: baseline.wallTimeMs - candidate.wallTimeMs,
    costUsdSaved: baseline.costUsd - candidate.costUsd,
    tokenProxySaved: tokenProxy(baseline.tokens) - tokenProxy(candidate.tokens),
  };
}

function mergeTokenUsage(total: TokenUsage, incoming?: TokenUsage): void {
  if (!incoming) {
    return;
  }

  total.inputUncached = (total.inputUncached ?? 0) + (incoming.inputUncached ?? 0);
  total.inputCached = (total.inputCached ?? 0) + (incoming.inputCached ?? 0);
  total.output = (total.output ?? 0) + (incoming.output ?? 0);
  total.thinking = (total.thinking ?? 0) + (incoming.thinking ?? 0);
  total.cacheWrite = (total.cacheWrite ?? 0) + (incoming.cacheWrite ?? 0);
}

export function aggregate(outcomes: RunOutcome[]): RunOutcome {
  if (outcomes.length === 0) {
    return {
      wallTimeMs: 0,
      success: true,
      retries: 0,
      costUsd: 0,
      tokens: {},
    };
  }

  const aggregateTokens: TokenUsage = {};
  let allSuccess = true;
  let wallTimeMs = 0;
  let retries = 0;
  let costUsd = 0;

  for (const outcome of outcomes) {
    allSuccess = allSuccess && outcome.success;
    wallTimeMs += outcome.wallTimeMs;
    retries += outcome.retries;
    costUsd += outcome.costUsd;
    mergeTokenUsage(aggregateTokens, outcome.tokens);
  }

  return {
    wallTimeMs,
    success: allSuccess,
    retries,
    costUsd,
    tokens: aggregateTokens,
  };
}

export function deriveRunOutcomeFromEvents(events: TraceEvent[]): RunOutcome {
  if (events.length === 0) {
    return {
      wallTimeMs: 0,
      success: true,
      retries: 0,
      costUsd: 0,
      tokens: {},
    };
  }

  const tokens: TokenUsage = {};
  let wallTimeMs = 0;
  let costUsd = 0;
  let retries = 0;
  let lastObservedOutcome: boolean | undefined;

  for (const event of events) {
    wallTimeMs += event.metrics?.latencyMs ?? 0;
    costUsd += event.metrics?.cost?.usd ?? 0;
    mergeTokenUsage(tokens, event.metrics?.tokens);

    if (event.type === "tool_result" && event.metrics?.outcome === "failure") {
      retries += 1;
    }

    if (event.metrics?.outcome === "success") {
      lastObservedOutcome = true;
    }
    if (event.metrics?.outcome === "failure") {
      lastObservedOutcome = false;
    }
  }

  return {
    wallTimeMs,
    success: lastObservedOutcome ?? true,
    retries,
    costUsd,
    tokens,
  };
}

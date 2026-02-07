import type { TokenUsage } from "./types.js";

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

    aggregateTokens.inputUncached =
      (aggregateTokens.inputUncached ?? 0) + (outcome.tokens.inputUncached ?? 0);
    aggregateTokens.inputCached =
      (aggregateTokens.inputCached ?? 0) + (outcome.tokens.inputCached ?? 0);
    aggregateTokens.output =
      (aggregateTokens.output ?? 0) + (outcome.tokens.output ?? 0);
    aggregateTokens.thinking =
      (aggregateTokens.thinking ?? 0) + (outcome.tokens.thinking ?? 0);
    aggregateTokens.cacheWrite =
      (aggregateTokens.cacheWrite ?? 0) + (outcome.tokens.cacheWrite ?? 0);
  }

  return {
    wallTimeMs,
    success: allSuccess,
    retries,
    costUsd,
    tokens: aggregateTokens,
  };
}

import type { LearningLoop } from "./learningLoop.js";
import { type RunOutcome, deriveRunOutcomeFromEvents, tokenProxy } from "./metrics.js";
import type {
  LearningSuggestion,
  SearchQuery,
  TraceEvent,
  TraceScope,
} from "./types.js";

export interface WrongTurnScenario {
  id: string;
  description: string;
  query: SearchQuery;
  expectedPhrases: string[];
  captureEvents: TraceEvent[];
}

export interface WrongTurnScenarioTemplate {
  id: string;
  description: string;
  query: SearchQuery;
  expectedPhrases: string[];
  captureEvents: Array<Omit<TraceEvent, "id" | "timestamp" | "sessionId">>;
}

export interface WrongTurnScenarioResult {
  scenarioId: string;
  description: string;
  suggestionLatencyMs: number;
  suggestionCount: number;
  matchedPhrase: string | null;
  rank: number | null;
  hitAt1: boolean;
  hitAt3: boolean;
  reciprocalRank: number;
  captureOutcome: RunOutcome;
  captureTokenProxy: number;
  topSuggestionRationale: string | null;
}

export interface WrongTurnEvaluationReport {
  totalScenarios: number;
  hitAt1Rate: number;
  hitAt3Rate: number;
  meanReciprocalRank: number;
  averageSuggestionLatencyMs: number;
  totalCaptureWallTimeMs: number;
  totalCaptureCostUsd: number;
  totalCaptureTokenProxy: number;
  scenarioResults: WrongTurnScenarioResult[];
}

export interface SuggestionQualityGate {
  minHitAt1Rate?: number;
  minHitAt3Rate?: number;
  minMeanReciprocalRank?: number;
}

export interface SuggestionQualityGateResult {
  pass: boolean;
  failures: string[];
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function searchableSuggestionText(suggestion: LearningSuggestion): string {
  return normalizeForMatch(
    `${suggestion.title} ${suggestion.rationale} ${suggestion.playbookMarkdown}`,
  );
}

function findSuggestionMatch(
  suggestions: LearningSuggestion[],
  expectedPhrases: string[],
): { rank: number | null; matchedPhrase: string | null } {
  const normalizedExpected = expectedPhrases
    .map((phrase) => normalizeForMatch(phrase))
    .filter((phrase) => phrase.length > 0);

  if (normalizedExpected.length === 0) {
    return {
      rank: null,
      matchedPhrase: null,
    };
  }

  for (const [index, suggestion] of suggestions.entries()) {
    const searchable = searchableSuggestionText(suggestion);
    for (const expected of normalizedExpected) {
      if (searchable.includes(expected)) {
        return {
          rank: index + 1,
          matchedPhrase: expected,
        };
      }
    }
  }

  return {
    rank: null,
    matchedPhrase: null,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(results: WrongTurnScenarioResult[]): WrongTurnEvaluationReport {
  const totalScenarios = results.length;
  const hitAt1Count = results.filter((result) => result.hitAt1).length;
  const hitAt3Count = results.filter((result) => result.hitAt3).length;

  return {
    totalScenarios,
    hitAt1Rate: totalScenarios === 0 ? 0 : hitAt1Count / totalScenarios,
    hitAt3Rate: totalScenarios === 0 ? 0 : hitAt3Count / totalScenarios,
    meanReciprocalRank: average(results.map((result) => result.reciprocalRank)),
    averageSuggestionLatencyMs: average(
      results.map((result) => result.suggestionLatencyMs),
    ),
    totalCaptureWallTimeMs: results.reduce(
      (sum, result) => sum + result.captureOutcome.wallTimeMs,
      0,
    ),
    totalCaptureCostUsd: results.reduce(
      (sum, result) => sum + result.captureOutcome.costUsd,
      0,
    ),
    totalCaptureTokenProxy: results.reduce(
      (sum, result) => sum + result.captureTokenProxy,
      0,
    ),
    scenarioResults: results,
  };
}

export function buildWrongTurnScenarioFromTemplate(
  template: WrongTurnScenarioTemplate,
  options: {
    harness: string;
    scope?: TraceScope;
    sessionId: string;
    timestampStart: Date;
    timestampStepMs?: number;
    idPrefix?: string;
  },
): WrongTurnScenario {
  const scope = options.scope ?? "personal";
  const timestampStepMs = options.timestampStepMs ?? 1_000;
  const idPrefix = options.idPrefix ?? template.id;

  const captureEvents: TraceEvent[] = template.captureEvents.map((event, index) => {
    const timestamp = new Date(
      options.timestampStart.getTime() + index * timestampStepMs,
    ).toISOString();

    return {
      ...event,
      id: `${idPrefix}-${index + 1}`,
      timestamp,
      sessionId: options.sessionId,
      harness: event.harness || options.harness,
      scope: event.scope || scope,
    };
  });

  return {
    id: template.id,
    description: template.description,
    query: template.query,
    expectedPhrases: template.expectedPhrases,
    captureEvents,
  };
}

export async function runWrongTurnScenario(
  loop: LearningLoop,
  scenario: WrongTurnScenario,
): Promise<WrongTurnScenarioResult> {
  for (const event of scenario.captureEvents) {
    await loop.ingest(event);
  }

  const captureOutcome = deriveRunOutcomeFromEvents(scenario.captureEvents);
  const captureTokenProxy = tokenProxy(captureOutcome.tokens);

  const startMs = Date.now();
  const suggestions = await loop.suggest(scenario.query);
  const suggestionLatencyMs = Date.now() - startMs;

  const match = findSuggestionMatch(suggestions, scenario.expectedPhrases);
  const hitAt1 = match.rank === 1;
  const hitAt3 = match.rank !== null && match.rank <= 3;

  return {
    scenarioId: scenario.id,
    description: scenario.description,
    suggestionLatencyMs,
    suggestionCount: suggestions.length,
    matchedPhrase: match.matchedPhrase,
    rank: match.rank,
    hitAt1,
    hitAt3,
    reciprocalRank: match.rank === null ? 0 : 1 / match.rank,
    captureOutcome,
    captureTokenProxy,
    topSuggestionRationale: suggestions[0]?.rationale ?? null,
  };
}

export async function evaluateWrongTurnScenarios(
  scenarios: WrongTurnScenario[],
  createLoop: () => LearningLoop,
): Promise<WrongTurnEvaluationReport> {
  const results: WrongTurnScenarioResult[] = [];

  for (const scenario of scenarios) {
    const loop = createLoop();
    const result = await runWrongTurnScenario(loop, scenario);
    results.push(result);
  }

  return summarize(results);
}

export function evaluateSuggestionQualityGate(
  report: WrongTurnEvaluationReport,
  gate: SuggestionQualityGate,
): SuggestionQualityGateResult {
  const failures: string[] = [];

  if (gate.minHitAt1Rate !== undefined && report.hitAt1Rate < gate.minHitAt1Rate) {
    failures.push(
      `hit@1 ${report.hitAt1Rate.toFixed(3)} < ${gate.minHitAt1Rate.toFixed(3)}`,
    );
  }

  if (gate.minHitAt3Rate !== undefined && report.hitAt3Rate < gate.minHitAt3Rate) {
    failures.push(
      `hit@3 ${report.hitAt3Rate.toFixed(3)} < ${gate.minHitAt3Rate.toFixed(3)}`,
    );
  }

  if (
    gate.minMeanReciprocalRank !== undefined &&
    report.meanReciprocalRank < gate.minMeanReciprocalRank
  ) {
    failures.push(
      `mrr ${report.meanReciprocalRank.toFixed(3)} < ${gate.minMeanReciprocalRank.toFixed(3)}`,
    );
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

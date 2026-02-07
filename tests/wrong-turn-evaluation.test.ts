import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalLearningLoop } from "../src/backends/local/index.js";
import {
  type WrongTurnScenario,
  type WrongTurnScenarioTemplate,
  buildWrongTurnScenarioFromTemplate,
  evaluateSuggestionQualityGate,
  evaluateWrongTurnScenarios,
  runWrongTurnScenario,
} from "../src/core/wrongTurnEvaluation.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop();
    if (!path) {
      continue;
    }
    await rm(path, { recursive: true, force: true });
  }
});

function buildTemplate(): WrongTurnScenarioTemplate {
  return {
    id: "scenario-missing-module",
    description: "Use runInBand after module resolution failures.",
    query: {
      text: "npm run test error cannot find module",
      limit: 8,
    },
    expectedPhrases: ["runinband"],
    captureEvents: [
      {
        harness: "pi",
        scope: "personal",
        type: "tool_result",
        payload: {
          command: "npm run test",
          output: "Error: Cannot find module x",
          isError: true,
        },
        metrics: {
          outcome: "failure",
          latencyMs: 220,
          tokens: {
            inputUncached: 120,
            output: 40,
          },
          cost: {
            usd: 0.08,
          },
        },
      },
      {
        harness: "pi",
        scope: "personal",
        type: "tool_result",
        payload: {
          command: "npm run test -- --runInBand",
          output: "PASS",
          isError: false,
        },
        metrics: {
          outcome: "success",
          latencyMs: 120,
          tokens: {
            inputUncached: 80,
            output: 20,
          },
          cost: {
            usd: 0.04,
          },
        },
      },
    ],
  };
}

function buildScenario(options: {
  sessionId: string;
  idPrefix: string;
  expectedPhrases?: string[];
}): WrongTurnScenario {
  const template = buildTemplate();
  return buildWrongTurnScenarioFromTemplate(
    {
      ...template,
      expectedPhrases: options.expectedPhrases ?? template.expectedPhrases,
    },
    {
      harness: "pi",
      scope: "personal",
      sessionId: options.sessionId,
      timestampStart: new Date("2026-02-01T00:00:00.000Z"),
      idPrefix: options.idPrefix,
    },
  );
}

describe("wrong-turn evaluation", () => {
  it("runs an end-to-end wrong-turn scenario and finds the correction", async () => {
    const dir = await mkdtemp(join(tmpdir(), "happy-paths-wrong-turn-"));
    tempDirs.push(dir);

    const loop = createLocalLearningLoop({ dataDir: dir });
    const scenario = buildScenario({
      sessionId: "session-e2e",
      idPrefix: "e2e",
    });

    const result = await runWrongTurnScenario(loop, scenario);

    expect(result.rank).not.toBeNull();
    expect(result.hitAt3).toBe(true);
    expect(result.captureOutcome.success).toBe(true);
    expect(result.captureOutcome.wallTimeMs).toBe(340);
    expect(result.captureOutcome.costUsd).toBeCloseTo(0.12, 5);
    expect(result.captureTokenProxy).toBeGreaterThan(0);
    expect(result.suggestionCount).toBeGreaterThan(0);
  });

  it("evaluates multiple scenarios and enforces quality gates", async () => {
    const root = await mkdtemp(join(tmpdir(), "happy-paths-report-"));
    tempDirs.push(root);

    const hitScenario = buildScenario({
      sessionId: "session-hit",
      idPrefix: "hit",
    });
    const missScenario = buildScenario({
      sessionId: "session-miss",
      idPrefix: "miss",
      expectedPhrases: ["no-such-correction-token"],
    });

    let index = 0;
    const report = await evaluateWrongTurnScenarios([hitScenario, missScenario], () => {
      index += 1;
      return createLocalLearningLoop({
        dataDir: join(root, `loop-${index}`),
      });
    });

    expect(report.totalScenarios).toBe(2);
    expect(report.hitAt3Rate).toBeGreaterThan(0);
    expect(report.hitAt3Rate).toBeLessThan(1);
    expect(report.meanReciprocalRank).toBeGreaterThan(0);
    expect(report.totalCaptureWallTimeMs).toBe(680);
    expect(report.totalCaptureCostUsd).toBeCloseTo(0.24, 5);
    expect(report.totalCaptureTokenProxy).toBeGreaterThan(0);

    const permissiveGate = evaluateSuggestionQualityGate(report, {
      minHitAt3Rate: 0.4,
    });
    expect(permissiveGate.pass).toBe(true);

    const strictGate = evaluateSuggestionQualityGate(report, {
      minHitAt3Rate: 0.9,
    });
    expect(strictGate.pass).toBe(false);
    expect(strictGate.failures.length).toBeGreaterThan(0);
  });
});

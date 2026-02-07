import { join } from "node:path";
import {
  buildWrongTurnScenarioFromTemplate,
  createLocalLearningLoop,
  evaluateWrongTurnScenarios,
} from "../src/index.js";

const scenario = buildWrongTurnScenarioFromTemplate(
  {
    id: "missing-module",
    description: "Prefer --runInBand after repeated missing module failures.",
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
  },
  {
    harness: "pi",
    scope: "personal",
    sessionId: "example-session",
    timestampStart: new Date("2026-02-01T00:00:00.000Z"),
  },
);

const report = await evaluateWrongTurnScenarios([scenario], () => {
  return createLocalLearningLoop({
    dataDir: join(process.cwd(), ".happy-paths", "example-eval"),
  });
});

console.log(JSON.stringify(report, null, 2));

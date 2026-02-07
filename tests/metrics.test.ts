import { describe, expect, it } from "vitest";
import { aggregate, compareOutcomes, tokenProxy } from "../src/core/metrics.js";

describe("metrics", () => {
  it("computes weighted token proxy", () => {
    const proxy = tokenProxy({
      inputUncached: 100,
      inputCached: 50,
      output: 20,
      thinking: 10,
      cacheWrite: 40,
    });

    expect(proxy).toBeCloseTo(148, 5);
  });

  it("compares candidate against baseline", () => {
    const report = compareOutcomes(
      {
        wallTimeMs: 10_000,
        success: true,
        retries: 2,
        costUsd: 1.8,
        tokens: { inputUncached: 2_000, output: 500 },
      },
      {
        wallTimeMs: 7_000,
        success: true,
        retries: 1,
        costUsd: 1.0,
        tokens: { inputUncached: 1_100, output: 400 },
      },
    );

    expect(report.correctnessDelta).toBe(0);
    expect(report.wallTimeMsSaved).toBe(3_000);
    expect(report.costUsdSaved).toBeCloseTo(0.8, 5);
    expect(report.tokenProxySaved).toBeGreaterThan(0);
  });

  it("aggregates outcomes", () => {
    const rollup = aggregate([
      {
        wallTimeMs: 100,
        success: true,
        retries: 1,
        costUsd: 0.2,
        tokens: { inputUncached: 10, output: 5 },
      },
      {
        wallTimeMs: 120,
        success: false,
        retries: 2,
        costUsd: 0.5,
        tokens: { inputUncached: 12, output: 7 },
      },
    ]);

    expect(rollup.success).toBe(false);
    expect(rollup.wallTimeMs).toBe(220);
    expect(rollup.retries).toBe(3);
    expect(rollup.costUsd).toBe(0.7);
    expect(rollup.tokens.inputUncached).toBe(22);
    expect(rollup.tokens.output).toBe(12);
  });
});

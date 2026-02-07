import { describe, expect, it } from "vitest";
import {
  extractErrorSignatures,
  extractLikelyFilePaths,
  normalizeCommandSignature,
} from "../src/core/signatures.js";

describe("signatures", () => {
  it("extracts error signatures from noisy tool output", () => {
    const text = [
      "running tests...",
      "Error: Cannot find module './foo'",
      "at src/index.ts:12:5",
      "FAIL: 3 tests failed",
    ].join("\n");

    const signatures = extractErrorSignatures(text);

    expect(signatures.length).toBe(2);
    expect(signatures[0]).toContain("error:");
    expect(signatures[1]).toContain("fail");
  });

  it("extracts likely paths", () => {
    const text = "Edit src/core/loop.ts and tests/loop.test.ts then rerun.";

    const paths = extractLikelyFilePaths(text);

    expect(paths).toContain("src/core/loop.ts");
    expect(paths).toContain("tests/loop.test.ts");
  });

  it("normalizes command signatures", () => {
    const command = "npm run test -- --changedSince 4f3d9911";
    expect(normalizeCommandSignature(command)).toContain("<hex>");
  });
});

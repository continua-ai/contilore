import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileTraceStore } from "../src/backends/local/fileTraceStore.js";
import { InMemoryLexicalIndex } from "../src/backends/local/lexicalIndex.js";
import { LearningLoop } from "../src/core/learningLoop.js";
import { SimpleWrongTurnMiner } from "../src/core/miner.js";

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

describe("LearningLoop", () => {
  it("ingests, retrieves, and suggests", async () => {
    const dir = await mkdtemp(join(tmpdir(), "contilore-"));
    tempDirs.push(dir);

    const loop = new LearningLoop({
      store: new FileTraceStore(dir),
      index: new InMemoryLexicalIndex(),
      miner: new SimpleWrongTurnMiner(),
    });

    await loop.ingest({
      id: "evt-1",
      timestamp: new Date().toISOString(),
      sessionId: "session-a",
      harness: "pi",
      scope: "personal",
      type: "tool_result",
      payload: {
        command: "npm run lint",
        output: "Error: failed due to missing dependency",
        isError: true,
      },
      metrics: {
        outcome: "failure",
      },
    });

    const retrieval = await loop.retrieve({
      text: "missing dependency error",
    });

    expect(retrieval.length).toBeGreaterThan(0);

    const suggestions = await loop.suggest({ text: "lint failed missing dependency" });
    expect(suggestions.length).toBeGreaterThan(0);
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPiTraceExtension } from "../src/adapters/pi/extension.js";
import type { PiLikeApi } from "../src/adapters/pi/types.js";
import { createLocalLearningLoop } from "../src/backends/local/index.js";
import {
  DEFAULT_PROJECT_IDENTITY,
  resolveProjectIdentity,
} from "../src/core/projectIdentity.js";

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

type PiHandler = (event: unknown, context: unknown) => Promise<unknown> | unknown;

class FakePiApi implements PiLikeApi {
  private readonly handlers = new Map<string, PiHandler>();

  on(eventName: string, handler: PiHandler): void {
    this.handlers.set(eventName, handler);
  }

  async emit(eventName: string, event: unknown): Promise<unknown> {
    const handler = this.handlers.get(eventName);
    if (!handler) {
      throw new Error(`Missing handler for ${eventName}`);
    }
    return handler(event, {});
  }
}

describe("project identity", () => {
  it("resolves defaults and overrides", () => {
    const identity = resolveProjectIdentity({
      displayName: "FutureName",
      extensionCustomType: "future-name",
    });

    expect(identity.displayName).toBe("FutureName");
    expect(identity.extensionCustomType).toBe("future-name");
    expect(identity.slug).toBe(DEFAULT_PROJECT_IDENTITY.slug);
    expect(identity.npmPackageName).toBe(DEFAULT_PROJECT_IDENTITY.npmPackageName);
  });

  it("uses identity default data directory for local loop", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "happy-paths-identity-"));
    tempDirs.push(rootDir);

    const previousCwd = process.cwd();
    process.chdir(rootDir);
    try {
      const loop = createLocalLearningLoop({
        projectIdentity: {
          defaultDataDirName: ".renamable-project",
        },
      });

      await loop.ingest({
        id: "evt-identity",
        timestamp: new Date().toISOString(),
        sessionId: "session-identity",
        harness: "pi",
        scope: "personal",
        type: "tool_result",
        payload: {
          text: "Error: cannot find module",
          isError: true,
        },
        metrics: {
          outcome: "failure",
        },
      });

      const stored = await readFile(
        join(rootDir, ".renamable-project", "sessions", "session-identity.jsonl"),
        "utf-8",
      );

      expect(stored).toContain("evt-identity");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("uses identity custom message type in pi extension", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "happy-paths-extension-"));
    tempDirs.push(dataDir);

    const loop = createLocalLearningLoop({ dataDir });
    await loop.ingest({
      id: "evt-extension",
      timestamp: new Date().toISOString(),
      sessionId: "session-extension",
      harness: "pi",
      scope: "personal",
      type: "tool_result",
      payload: {
        text: "Error: missing dependency",
        isError: true,
      },
      metrics: {
        outcome: "failure",
      },
    });

    const fakePi = new FakePiApi();
    createPiTraceExtension({
      loop,
      projectIdentity: {
        extensionCustomType: "future-project-name",
      },
    })(fakePi);

    const response = (await fakePi.emit("before_agent_start", {
      prompt: "missing dependency",
      systemPrompt: "",
    })) as
      | {
          message?: {
            customType?: string;
          };
        }
      | undefined;

    expect(response?.message?.customType).toBe("future-project-name");
  });
});

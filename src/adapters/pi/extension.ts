import { randomUUID } from "node:crypto";
import type { LearningLoop } from "../../core/learningLoop.js";
import {
  type ProjectIdentityOverrides,
  resolveProjectIdentity,
} from "../../core/projectIdentity.js";
import type { TraceScope } from "../../core/types.js";
import type {
  PiBeforeAgentStartEvent,
  PiInputEvent,
  PiLikeApi,
  PiToolCallEvent,
  PiToolResultEvent,
  PiTurnEndEvent,
  PiTurnStartEvent,
} from "./types.js";

interface ToolCallState {
  toolName: string;
  input: Record<string, unknown>;
}

export interface PiTraceExtensionOptions {
  loop: LearningLoop;
  scope?: TraceScope;
  harnessName?: string;
  agentId?: string;
  maxSuggestions?: number;
  customMessageType?: string;
  projectIdentity?: ProjectIdentityOverrides;
}

function nowIso(): string {
  return new Date().toISOString();
}

function extractText(result: PiToolResultEvent): string {
  const textFromContent = (result.content ?? [])
    .map((chunk) => chunk.text)
    .join("\n")
    .trim();

  if (textFromContent) {
    return textFromContent;
  }

  if (result.details) {
    try {
      return JSON.stringify(result.details);
    } catch {
      return "";
    }
  }

  return "";
}

function commandFromInput(input: Record<string, unknown>): string | undefined {
  const command = input.command;
  if (typeof command === "string") {
    return command;
  }
  return undefined;
}

export function createPiTraceExtension(
  options: PiTraceExtensionOptions,
): (pi: PiLikeApi) => void {
  const loop = options.loop;
  const scope = options.scope ?? "personal";
  const harness = options.harnessName ?? "pi";
  const agentId = options.agentId;
  const maxSuggestions = options.maxSuggestions ?? 3;
  const projectIdentity = resolveProjectIdentity(options.projectIdentity);
  const customMessageType =
    options.customMessageType ?? projectIdentity.extensionCustomType;

  const sessionId = randomUUID();
  const turnStartTimes = new Map<number, number>();
  const toolCalls = new Map<string, ToolCallState>();

  async function ingest(event: {
    type:
      | "user_input"
      | "tool_call"
      | "tool_result"
      | "turn_summary"
      | "feedback"
      | "checkpoint"
      | "assistant_output";
    payload: Record<string, unknown>;
    tags?: string[];
    metrics?: {
      latencyMs?: number;
      outcome?: "success" | "failure" | "unknown";
      tokens?: {
        inputUncached?: number;
        inputCached?: number;
        output?: number;
        cacheWrite?: number;
      };
      cost?: {
        usd?: number;
      };
    };
  }): Promise<void> {
    await loop.ingest({
      id: randomUUID(),
      timestamp: nowIso(),
      sessionId,
      agentId,
      harness,
      scope,
      type: event.type,
      payload: event.payload,
      tags: event.tags,
      metrics: event.metrics,
    });
  }

  return (pi: PiLikeApi) => {
    pi.on("input", async (rawEvent) => {
      const event = rawEvent as PiInputEvent;
      await ingest({
        type: "user_input",
        payload: {
          text: event.text,
          source: event.source ?? "interactive",
        },
      });
    });

    pi.on("tool_call", async (rawEvent) => {
      const event = rawEvent as PiToolCallEvent;
      toolCalls.set(event.toolCallId, {
        toolName: event.toolName,
        input: event.input,
      });

      await ingest({
        type: "tool_call",
        payload: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          command: commandFromInput(event.input),
        },
      });
    });

    pi.on("tool_result", async (rawEvent) => {
      const event = rawEvent as PiToolResultEvent;
      const call = toolCalls.get(event.toolCallId);
      const text = extractText(event);
      const isError = event.isError === true;

      await ingest({
        type: "tool_result",
        payload: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          command: call ? commandFromInput(call.input) : undefined,
          isError,
          text,
          input: event.input,
        },
        metrics: {
          outcome: isError ? "failure" : "success",
        },
      });
    });

    pi.on("turn_start", (rawEvent) => {
      const event = rawEvent as PiTurnStartEvent;
      turnStartTimes.set(event.turnIndex, Date.now());
    });

    pi.on("turn_end", async (rawEvent) => {
      const event = rawEvent as PiTurnEndEvent;
      const startedAt = turnStartTimes.get(event.turnIndex) ?? Date.now();
      const usage = event.message?.usage;

      await ingest({
        type: "turn_summary",
        payload: {
          turnIndex: event.turnIndex,
        },
        metrics: {
          latencyMs: Date.now() - startedAt,
          tokens: {
            inputUncached: usage?.input,
            inputCached: usage?.cacheRead,
            output: usage?.output,
            cacheWrite: usage?.cacheWrite,
          },
          cost: {
            usd: usage?.cost?.total,
          },
        },
      });
    });

    pi.on("before_agent_start", async (rawEvent) => {
      const event = rawEvent as PiBeforeAgentStartEvent;
      const suggestions = await loop.suggest({
        text: event.prompt,
        limit: maxSuggestions,
      });

      if (suggestions.length === 0) {
        return undefined;
      }

      const rendered = suggestions
        .slice(0, maxSuggestions)
        .map((suggestion, index) => {
          return `${index + 1}. ${suggestion.rationale}`;
        })
        .join("\n");

      return {
        message: {
          customType: customMessageType,
          content: `Prior trace hints:\n${rendered}`,
          display: true,
        },
      };
    });
  };
}

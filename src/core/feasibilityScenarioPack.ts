import type { TokenUsage, TraceEvent, TraceScope } from "./types.js";
import type { WrongTurnDataset } from "./wrongTurnDataset.js";
import type {
  SuggestionQualityGate,
  WrongTurnScenarioTemplate,
} from "./wrongTurnEvaluation.js";

export interface FeasibilityScenarioExtractionOptions {
  sessionId?: string;
  harness?: string;
  scope?: TraceScope;
  queryLimit?: number;
  maxExpectedPhrases?: number;
  requireCommandChange?: boolean;
  scenarioIdPrefix?: string;
  maxQueryTextChars?: number;
  maxSignatureChars?: number;
}

export interface PiSessionScenarioExtractionOptions
  extends FeasibilityScenarioExtractionOptions {
  toolName?: string;
  maxToolOutputChars?: number;
}

const GENERIC_COMMAND_TOKENS = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "python",
  "python3",
  "bash",
  "cd",
  "run",
  "test",
  "build",
  "lint",
  "check",
  "info",
  "error",
  "command",
  "exited",
  "code",
  "output",
  "checked",
  "files",
  "fixed",
  "found",
  "line",
  "lines",
  "src",
  "dist",
]);

const PI_FAILURE_OUTPUT_PATTERNS = [
  /command exited with code [1-9]\d*/i,
  /command timed out/i,
  /command aborted/i,
];

const DEFAULT_MAX_QUERY_TEXT_CHARS = 280;
const DEFAULT_MAX_SIGNATURE_CHARS = 180;
const DEFAULT_MAX_TOOL_OUTPUT_CHARS = 2_000;

type JsonRecord = Record<string, unknown>;

interface PendingPiToolCall {
  command: string;
  timestamp: string;
  timestampMs: number | null;
  modelLatencyMs: number;
  modelTokens: TokenUsage;
  modelCostUsd: number;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sanitizeId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "scenario";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function eventCommand(event: TraceEvent): string {
  const command = event.payload?.command;
  if (typeof command === "string") {
    return normalizeWhitespace(command);
  }
  return "";
}

function eventText(event: TraceEvent): string {
  const payloadText = event.payload?.text;
  if (typeof payloadText === "string" && payloadText.trim()) {
    return payloadText.trim();
  }

  const payloadOutput = event.payload?.output;
  if (typeof payloadOutput === "string" && payloadOutput.trim()) {
    return payloadOutput.trim();
  }

  return "";
}

function truncateText(input: string, maxChars: number): string {
  if (maxChars <= 0 || input.length <= maxChars) {
    return input;
  }
  return `${input.slice(0, maxChars).trimEnd()}…`;
}

function tokenizedKeywords(input: string): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const rawToken of input.split(/\s+/)) {
    const token = rawToken.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (token.length < 3 || token.length > 32) {
      continue;
    }
    if (/^\d+$/.test(token)) {
      continue;
    }
    if (GENERIC_COMMAND_TOKENS.has(token)) {
      continue;
    }
    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    output.push(token);
  }

  return output;
}

function inferExpectedPhrases(
  failureCommand: string,
  successCommand: string,
  successText: string,
  maxExpectedPhrases: number,
): string[] {
  const successCommandTokens = tokenizedKeywords(successCommand);
  const failureTokens = new Set(tokenizedKeywords(failureCommand));

  const diffTokens = successCommandTokens.filter((token) => !failureTokens.has(token));
  const primary = diffTokens.length > 0 ? diffTokens : successCommandTokens;

  const fallback = tokenizedKeywords(successText);

  const merged = [...primary, ...fallback];
  const unique = Array.from(new Set(merged));
  return unique.slice(0, maxExpectedPhrases);
}

function firstLine(input: string): string {
  return normalizeWhitespace(input.split(/\r?\n/, 1)[0] ?? "");
}

function buildQueryText(
  failureText: string,
  failureCommand: string,
  maxChars: number,
): string {
  const parts: string[] = [];
  if (failureText) {
    parts.push(firstLine(failureText));
  }
  if (failureCommand) {
    parts.push(failureCommand);
  }
  const normalized = normalizeWhitespace(parts.join(" "));
  return truncateText(normalized, maxChars);
}

function isFailureToolResult(event: TraceEvent): boolean {
  if (event.type !== "tool_result") {
    return false;
  }
  if (event.metrics?.outcome === "failure") {
    return true;
  }
  return event.payload?.isError === true;
}

function isSuccessToolResult(event: TraceEvent): boolean {
  if (event.type !== "tool_result") {
    return false;
  }
  if (event.metrics?.outcome === "success") {
    return true;
  }
  return event.payload?.isError === false;
}

function toTemplateCaptureEvent(
  event: TraceEvent,
  options: {
    fallbackHarness: string;
    fallbackScope: TraceScope;
  },
): Omit<TraceEvent, "id" | "timestamp" | "sessionId"> {
  const harness = event.harness || options.fallbackHarness;
  const scope = event.scope || options.fallbackScope;

  const { id: _id, timestamp: _timestamp, sessionId: _sessionId, ...rest } = event;
  return {
    ...rest,
    harness,
    scope,
  };
}

function inferPiSessionId(records: JsonRecord[]): string {
  for (const record of records) {
    const recordType = asString(record.type);
    if (recordType !== "session") {
      continue;
    }
    const sessionId = asString(record.id);
    if (sessionId) {
      return sessionId;
    }
  }
  return "pi-session";
}

function parseTimestampMs(timestamp: string | null): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeDeltaMs(startMs: number | null, endMs: number | null): number {
  if (startMs === null || endMs === null) {
    return 0;
  }
  return Math.max(0, endMs - startMs);
}

function parseAssistantUsageTokens(message: JsonRecord): TokenUsage {
  const usage = asRecord(message.usage);
  if (!usage) {
    return {};
  }

  const input = asNumber(usage.input) ?? asNumber(usage.inputTokens) ?? 0;
  const cacheRead = asNumber(usage.cacheRead) ?? asNumber(usage.cachedInputTokens) ?? 0;
  const output = asNumber(usage.output) ?? asNumber(usage.outputTokens) ?? 0;
  const cacheWrite = asNumber(usage.cacheWrite) ?? 0;
  const thinking = asNumber(usage.thinking) ?? asNumber(usage.reasoning) ?? 0;

  return {
    inputUncached: input,
    inputCached: cacheRead,
    output,
    cacheWrite,
    thinking,
  };
}

function parseAssistantUsageCostUsd(message: JsonRecord): number {
  const usage = asRecord(message.usage);
  if (!usage) {
    return 0;
  }

  const usageCost = asRecord(usage.cost);
  const directTotal = usageCost ? asNumber(usageCost.total) : null;
  if (directTotal !== null) {
    return directTotal;
  }

  const inputCost = usageCost ? (asNumber(usageCost.input) ?? 0) : 0;
  const outputCost = usageCost ? (asNumber(usageCost.output) ?? 0) : 0;
  const cacheReadCost = usageCost ? (asNumber(usageCost.cacheRead) ?? 0) : 0;
  const cacheWriteCost = usageCost ? (asNumber(usageCost.cacheWrite) ?? 0) : 0;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

function splitTokenUsage(usage: TokenUsage, parts: number): TokenUsage {
  if (parts <= 1) {
    return {
      inputUncached: usage.inputUncached ?? 0,
      inputCached: usage.inputCached ?? 0,
      output: usage.output ?? 0,
      cacheWrite: usage.cacheWrite ?? 0,
      thinking: usage.thinking ?? 0,
    };
  }

  return {
    inputUncached: (usage.inputUncached ?? 0) / parts,
    inputCached: (usage.inputCached ?? 0) / parts,
    output: (usage.output ?? 0) / parts,
    cacheWrite: (usage.cacheWrite ?? 0) / parts,
    thinking: (usage.thinking ?? 0) / parts,
  };
}

function hasTokenUsage(usage: TokenUsage): boolean {
  return (
    (usage.inputUncached ?? 0) > 0 ||
    (usage.inputCached ?? 0) > 0 ||
    (usage.output ?? 0) > 0 ||
    (usage.cacheWrite ?? 0) > 0 ||
    (usage.thinking ?? 0) > 0
  );
}

function parseToolCallCommand(toolCall: JsonRecord): string {
  const argumentsObject = asRecord(toolCall.arguments);
  const command = argumentsObject ? asString(argumentsObject.command) : null;
  if (command) {
    return normalizeWhitespace(command);
  }

  const partialJson = asString(toolCall.partialJson);
  if (!partialJson) {
    return "";
  }

  try {
    const parsed = JSON.parse(partialJson);
    const parsedObject = asRecord(parsed);
    const parsedCommand = parsedObject ? asString(parsedObject.command) : null;
    return parsedCommand ? normalizeWhitespace(parsedCommand) : "";
  } catch {
    return "";
  }
}

function parseToolResultOutput(message: JsonRecord): string {
  const content = asArray(message.content);
  const chunks: string[] = [];

  for (const entry of content) {
    const entryObject = asRecord(entry);
    if (!entryObject) {
      continue;
    }

    const entryType = asString(entryObject.type);
    const text = asString(entryObject.text);
    if (entryType === "text" && text) {
      chunks.push(text.trim());
    }
  }

  return chunks.join("\n").trim();
}

function inferPiToolResultIsError(explicitIsError: boolean, output: string): boolean {
  if (explicitIsError) {
    return true;
  }

  if (/command exited with code 0/i.test(output)) {
    return false;
  }

  return PI_FAILURE_OUTPUT_PATTERNS.some((pattern) => pattern.test(output));
}

function fallbackTimestamp(index: number): string {
  return new Date(index).toISOString();
}

export function buildTraceEventsFromPiSessionRecords(
  records: JsonRecord[],
  options: {
    sessionId: string;
    harness: string;
    scope: TraceScope;
    toolName: string;
    maxToolOutputChars?: number;
  },
): TraceEvent[] {
  const pendingToolCalls = new Map<string, PendingPiToolCall>();
  const traceEvents: TraceEvent[] = [];
  const maxToolOutputChars =
    options.maxToolOutputChars ?? DEFAULT_MAX_TOOL_OUTPUT_CHARS;
  let previousMessageTimestampMs: number | null = null;

  for (const [index, record] of records.entries()) {
    const recordType = asString(record.type);
    if (recordType !== "message") {
      continue;
    }

    const message = asRecord(record.message);
    if (!message) {
      continue;
    }

    const timestamp = asString(record.timestamp) ?? fallbackTimestamp(index);
    const timestampMs = parseTimestampMs(timestamp);
    const role = asString(message.role);

    if (role === "assistant") {
      const matchingToolCalls: Array<{ id: string; command: string }> = [];
      for (const contentEntry of asArray(message.content)) {
        const toolCall = asRecord(contentEntry);
        if (!toolCall) {
          continue;
        }

        if (asString(toolCall.type) !== "toolCall") {
          continue;
        }

        if (asString(toolCall.name) !== options.toolName) {
          continue;
        }

        const toolCallId = asString(toolCall.id);
        if (!toolCallId) {
          continue;
        }

        const command = parseToolCallCommand(toolCall);
        if (!command) {
          continue;
        }

        matchingToolCalls.push({
          id: toolCallId,
          command,
        });
      }

      if (matchingToolCalls.length > 0) {
        const assistantLatencyMs = nonNegativeDeltaMs(
          previousMessageTimestampMs,
          timestampMs,
        );
        const usageTokens = parseAssistantUsageTokens(message);
        const usageCostUsd = parseAssistantUsageCostUsd(message);
        const callCount = matchingToolCalls.length;

        for (const toolCall of matchingToolCalls) {
          pendingToolCalls.set(toolCall.id, {
            command: toolCall.command,
            timestamp,
            timestampMs,
            modelLatencyMs: assistantLatencyMs / callCount,
            modelTokens: splitTokenUsage(usageTokens, callCount),
            modelCostUsd: usageCostUsd / callCount,
          });
        }
      }

      if (timestampMs !== null) {
        previousMessageTimestampMs = timestampMs;
      }
      continue;
    }

    if (role !== "toolResult") {
      if (timestampMs !== null) {
        previousMessageTimestampMs = timestampMs;
      }
      continue;
    }

    if (asString(message.toolName) !== options.toolName) {
      if (timestampMs !== null) {
        previousMessageTimestampMs = timestampMs;
      }
      continue;
    }

    const toolCallId = asString(message.toolCallId);
    if (!toolCallId) {
      if (timestampMs !== null) {
        previousMessageTimestampMs = timestampMs;
      }
      continue;
    }

    const pending = pendingToolCalls.get(toolCallId);
    const command = pending?.command ?? "";
    const output = truncateText(parseToolResultOutput(message), maxToolOutputChars);
    if (!command && !output) {
      if (timestampMs !== null) {
        previousMessageTimestampMs = timestampMs;
      }
      continue;
    }

    const explicitIsError = message.isError === true;
    const isError = inferPiToolResultIsError(explicitIsError, output);
    const toolLatencyMs = nonNegativeDeltaMs(pending?.timestampMs ?? null, timestampMs);
    const totalLatencyMs = toolLatencyMs + (pending?.modelLatencyMs ?? 0);

    const tokens = pending?.modelTokens ?? {};
    const costUsd = pending?.modelCostUsd ?? 0;

    traceEvents.push({
      id: `${options.sessionId}-pi-tool-result-${traceEvents.length + 1}`,
      timestamp: timestamp || pending?.timestamp || fallbackTimestamp(index),
      sessionId: options.sessionId,
      harness: options.harness,
      scope: options.scope,
      type: "tool_result",
      payload: {
        command,
        output,
        isError,
      },
      metrics: {
        latencyMs: totalLatencyMs,
        tokens: hasTokenUsage(tokens) ? tokens : undefined,
        cost: costUsd > 0 ? { usd: costUsd } : undefined,
        outcome: isError ? "failure" : "success",
      },
    });

    pendingToolCalls.delete(toolCallId);

    if (timestampMs !== null) {
      previousMessageTimestampMs = timestampMs;
    }
  }

  return traceEvents;
}

export function extractWrongTurnScenarioTemplatesFromEvents(
  events: TraceEvent[],
  options: FeasibilityScenarioExtractionOptions = {},
): WrongTurnScenarioTemplate[] {
  const sortedEvents = [...events].sort((left, right) => {
    return left.timestamp < right.timestamp
      ? -1
      : left.timestamp > right.timestamp
        ? 1
        : 0;
  });

  const inferredSessionId =
    options.sessionId ||
    sortedEvents.find((event) => event.sessionId)?.sessionId ||
    "session";

  const fallbackHarness =
    options.harness || sortedEvents.find((event) => event.harness)?.harness || "pi";
  const fallbackScope =
    options.scope || sortedEvents.find((event) => event.scope)?.scope || "personal";

  const maxExpectedPhrases = options.maxExpectedPhrases ?? 3;
  const requireCommandChange = options.requireCommandChange ?? true;
  const queryLimit = options.queryLimit ?? 8;
  const maxQueryTextChars = options.maxQueryTextChars ?? DEFAULT_MAX_QUERY_TEXT_CHARS;
  const maxSignatureChars = options.maxSignatureChars ?? DEFAULT_MAX_SIGNATURE_CHARS;
  const scenarioIdPrefix = options.scenarioIdPrefix ?? sanitizeId(inferredSessionId);

  const templates: WrongTurnScenarioTemplate[] = [];

  for (let index = 0; index < sortedEvents.length; index += 1) {
    const failureEvent = sortedEvents[index];
    if (!failureEvent || !isFailureToolResult(failureEvent)) {
      continue;
    }

    let successIndex = -1;
    for (let probe = index + 1; probe < sortedEvents.length; probe += 1) {
      const candidate = sortedEvents[probe];
      if (candidate && isSuccessToolResult(candidate)) {
        successIndex = probe;
        break;
      }
    }

    if (successIndex < 0) {
      continue;
    }

    const successEvent = sortedEvents[successIndex];
    if (!successEvent) {
      continue;
    }

    const failureCommand = eventCommand(failureEvent);
    const successCommand = eventCommand(successEvent);
    const failureText = eventText(failureEvent);
    const successText = eventText(successEvent);

    if (
      requireCommandChange &&
      failureCommand &&
      successCommand &&
      failureCommand.toLowerCase() === successCommand.toLowerCase()
    ) {
      continue;
    }

    const expectedPhrases = inferExpectedPhrases(
      failureCommand,
      successCommand,
      successText,
      maxExpectedPhrases,
    );
    if (expectedPhrases.length === 0) {
      continue;
    }

    const queryText = buildQueryText(failureText, failureCommand, maxQueryTextChars);
    if (!queryText) {
      continue;
    }

    const signature = truncateText(
      firstLine(failureText || failureCommand || "recovery scenario"),
      maxSignatureChars,
    );
    const scenarioId = `${scenarioIdPrefix}-recovery-${templates.length + 1}`;

    templates.push({
      id: scenarioId,
      description: `Recover from ${signature}`,
      query: {
        text: queryText,
        limit: queryLimit,
      },
      expectedPhrases,
      captureEvents: [
        toTemplateCaptureEvent(failureEvent, {
          fallbackHarness,
          fallbackScope,
        }),
        toTemplateCaptureEvent(successEvent, {
          fallbackHarness,
          fallbackScope,
        }),
      ],
    });

    index = successIndex;
  }

  return templates;
}

export function extractWrongTurnScenarioTemplatesFromPiSessionRecords(
  records: JsonRecord[],
  options: PiSessionScenarioExtractionOptions = {},
): WrongTurnScenarioTemplate[] {
  const sessionId = options.sessionId || inferPiSessionId(records);
  const harness = options.harness || "pi";
  const scope = options.scope || "personal";
  const toolName = options.toolName || "bash";

  const traceEvents = buildTraceEventsFromPiSessionRecords(records, {
    sessionId,
    harness,
    scope,
    toolName,
    maxToolOutputChars: options.maxToolOutputChars,
  });

  return extractWrongTurnScenarioTemplatesFromEvents(traceEvents, {
    sessionId,
    harness,
    scope,
    queryLimit: options.queryLimit,
    maxExpectedPhrases: options.maxExpectedPhrases,
    requireCommandChange: options.requireCommandChange,
    scenarioIdPrefix: options.scenarioIdPrefix,
    maxQueryTextChars: options.maxQueryTextChars,
    maxSignatureChars: options.maxSignatureChars,
  });
}

export function buildWrongTurnDatasetFromTemplates(
  templates: WrongTurnScenarioTemplate[],
  options: {
    qualityGate?: SuggestionQualityGate;
  } = {},
): WrongTurnDataset {
  const uniqueTemplates = templates.map((template, index) => {
    return {
      ...template,
      id: template.id || `scenario-${index + 1}`,
    };
  });

  return {
    schemaVersion: 1,
    qualityGate: options.qualityGate,
    scenarios: uniqueTemplates,
  };
}

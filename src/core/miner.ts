import type { TraceMiner } from "./interfaces.js";
import { areNearDuplicate } from "./nearDup.js";
import {
  extractErrorSignatures,
  normalizeCommandSignature,
  normalizeText,
} from "./signatures.js";
import type { MinedArtifact, TraceEvent } from "./types.js";

interface ToolOutcome {
  event: TraceEvent;
  isError: boolean;
  command: string;
  text: string;
}

const LOOKAHEAD_RESULTS = 6;

function payloadText(payload: Record<string, unknown>): string {
  const candidates: unknown[] = [
    payload.output,
    payload.stderr,
    payload.stdout,
    payload.text,
    payload.content,
    payload.error,
    payload.message,
  ];

  const firstText = candidates.find((item) => typeof item === "string");
  if (typeof firstText === "string") {
    return firstText;
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function toToolOutcome(event: TraceEvent): ToolOutcome | null {
  if (event.type !== "tool_result") {
    return null;
  }

  const isError =
    event.metrics?.outcome === "failure" || event.payload.isError === true;

  const commandValue = event.payload.command;
  const command = typeof commandValue === "string" ? commandValue : "";

  return {
    event,
    isError,
    command,
    text: payloadText(event.payload),
  };
}

export class SimpleWrongTurnMiner implements TraceMiner {
  private readonly eventsBySession = new Map<string, TraceEvent[]>();

  async ingest(event: TraceEvent): Promise<void> {
    const bucket = this.eventsBySession.get(event.sessionId) ?? [];
    bucket.push(event);
    this.eventsBySession.set(event.sessionId, bucket);
  }

  async mine(limit = 50): Promise<MinedArtifact[]> {
    const artifacts: MinedArtifact[] = [];
    const seen = new Set<string>();

    for (const events of this.eventsBySession.values()) {
      const toolResults = events
        .map((event) => toToolOutcome(event))
        .filter((event): event is ToolOutcome => event !== null);

      for (let index = 0; index < toolResults.length; index += 1) {
        const current = toolResults[index];
        if (!current || !current.isError) {
          continue;
        }

        const failureSignature = this.failureSignature(current);
        if (!failureSignature) {
          continue;
        }

        for (
          let lookahead = index + 1;
          lookahead < toolResults.length && lookahead <= index + LOOKAHEAD_RESULTS;
          lookahead += 1
        ) {
          const candidate = toolResults[lookahead];
          if (!candidate || candidate.isError) {
            continue;
          }

          if (this.isUnchangedRetry(current, candidate)) {
            continue;
          }

          const successSignature = this.successSignature(candidate);
          if (!successSignature) {
            continue;
          }

          const fingerprint = `${failureSignature}=>${successSignature}`;
          if (seen.has(fingerprint)) {
            continue;
          }

          seen.add(fingerprint);
          artifacts.push({
            id: `artifact-${current.event.id}-${candidate.event.id}`,
            kind: "wrong_turn_fix",
            summary: `When you hit "${failureSignature}", prefer "${successSignature}".`,
            confidence: 0.6,
            evidenceEventIds: [current.event.id, candidate.event.id],
            metadata: {
              failureSignature,
              successSignature,
            },
          });

          if (artifacts.length >= limit) {
            return artifacts;
          }
          break;
        }
      }
    }

    return artifacts;
  }

  private failureSignature(outcome: ToolOutcome): string {
    const fromCommand = normalizeCommandSignature(outcome.command);
    if (fromCommand) {
      return fromCommand;
    }

    const errorSignatures = extractErrorSignatures(outcome.text, 1);
    return errorSignatures[0] ?? normalizeText(outcome.text).slice(0, 120);
  }

  private successSignature(outcome: ToolOutcome): string {
    const command = normalizeCommandSignature(outcome.command);
    if (command) {
      return command;
    }

    return normalizeText(outcome.text).slice(0, 120);
  }

  private isUnchangedRetry(failure: ToolOutcome, success: ToolOutcome): boolean {
    const failureCommand = failure.command.trim();
    const successCommand = success.command.trim();

    if (!failureCommand || !successCommand) {
      return false;
    }

    if (failureCommand === successCommand) {
      return true;
    }

    return areNearDuplicate(failureCommand, successCommand, 0.95);
  }
}

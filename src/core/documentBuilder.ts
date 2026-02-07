import type { EventDocumentBuilder } from "./interfaces.js";
import { extractErrorSignatures, extractLikelyFilePaths } from "./signatures.js";
import type { IndexedDocument, TraceEvent } from "./types.js";

const MAX_DOC_TEXT_LENGTH = 6_000;

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable-payload]";
  }
}

function compactWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function clipText(text: string): string {
  if (text.length <= MAX_DOC_TEXT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_DOC_TEXT_LENGTH)}\n...[truncated]`;
}

export class DefaultEventDocumentBuilder implements EventDocumentBuilder {
  build(event: TraceEvent): IndexedDocument[] {
    const payloadText = toText(event.payload);
    const baseText = compactWhitespace(`${event.type} ${event.harness} ${payloadText}`);

    const metadata: Record<string, string | number | boolean | null> = {
      eventType: event.type,
      harness: event.harness,
      scope: event.scope,
      sessionId: event.sessionId,
    };

    if (event.agentId) {
      metadata.agentId = event.agentId;
    }

    const docs: IndexedDocument[] = [
      {
        id: `${event.id}:base`,
        sourceEventId: event.id,
        text: clipText(baseText),
        metadata,
      },
    ];

    const errorSignatures = extractErrorSignatures(payloadText);
    errorSignatures.forEach((signature, index) => {
      docs.push({
        id: `${event.id}:err:${index}`,
        sourceEventId: event.id,
        text: signature,
        metadata: {
          ...metadata,
          isErrorSignature: true,
        },
      });
    });

    const filePaths = extractLikelyFilePaths(payloadText);
    filePaths.forEach((path, index) => {
      docs.push({
        id: `${event.id}:path:${index}`,
        sourceEventId: event.id,
        text: path,
        metadata: {
          ...metadata,
          isPath: true,
        },
      });
    });

    return docs;
  }
}

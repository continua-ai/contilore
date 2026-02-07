import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TraceStore } from "../../core/interfaces.js";
import type { TraceEvent, TraceQuery } from "../../core/types.js";

function toMillis(iso: string): number {
  return new Date(iso).getTime();
}

export class FileTraceStore implements TraceStore {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async append(event: TraceEvent): Promise<void> {
    const path = this.pathForSession(event.sessionId);
    await mkdir(dirname(path), { recursive: true });
    const line = `${JSON.stringify(event)}\n`;
    await writeFile(path, line, { encoding: "utf-8", flag: "a" });
  }

  async appendMany(events: TraceEvent[]): Promise<void> {
    for (const event of events) {
      await this.append(event);
    }
  }

  async query(query: TraceQuery): Promise<TraceEvent[]> {
    const files = await this.filesForQuery(query);
    const output: TraceEvent[] = [];

    const sinceMs = query.since ? toMillis(query.since) : undefined;
    const untilMs = query.until ? toMillis(query.until) : undefined;

    for (const file of files) {
      const raw = await readFile(file, "utf-8").catch(() => "");
      if (!raw) {
        continue;
      }

      for (const line of raw.split(/\r?\n/)) {
        if (!line) {
          continue;
        }

        let event: TraceEvent;
        try {
          event = JSON.parse(line) as TraceEvent;
        } catch {
          continue;
        }

        if (query.types && !query.types.includes(event.type)) {
          continue;
        }

        const eventMs = toMillis(event.timestamp);
        if (sinceMs !== undefined && eventMs < sinceMs) {
          continue;
        }
        if (untilMs !== undefined && eventMs > untilMs) {
          continue;
        }

        output.push(event);
      }
    }

    output.sort((left, right) =>
      left.timestamp < right.timestamp ? -1 : left.timestamp > right.timestamp ? 1 : 0,
    );

    const limit = query.limit ?? output.length;
    if (limit <= 0) {
      return [];
    }

    return output.slice(0, limit);
  }

  private async filesForQuery(query: TraceQuery): Promise<string[]> {
    const sessionDir = join(this.rootDir, "sessions");
    await mkdir(sessionDir, { recursive: true });

    if (query.sessionIds && query.sessionIds.length > 0) {
      return query.sessionIds.map((sessionId) => this.pathForSession(sessionId));
    }

    const entries = await readdir(sessionDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(sessionDir, entry.name));
  }

  private pathForSession(sessionId: string): string {
    return join(this.rootDir, "sessions", `${sessionId}.jsonl`);
  }
}

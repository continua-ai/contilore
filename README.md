# Continua Loop

Trace-driven learning loop for coding agents.

Capture agent traces, index them quickly, mine wrong-turn corrections, and feed
high-confidence hints back into future runs.

## Why this exists

Agentic coding burns time and tokens on repeated dead ends. This is amplified
across many concurrent agents and teammates.

Continua Loop turns traces into reusable learning artifacts:

- **anti-patterns** (what to avoid)
- **happy paths** (what tends to work)
- **playbooks** (small, reviewable recipes)

## Principles

- **Correctness first**: never trade reliability for speed/cost.
- **Lexical-first retrieval**: signatures + BM25-style behavior before heavy
  semantic indexing.
- **Out-of-the-box local mode**: no mandatory external DB/vector service.
- **Pluggable architecture**: harness adapters and storage/index backends are
  replaceable.

## Current status

Early scaffold / MVP foundations:

- normalized trace schema
- local JSONL trace store
- in-memory lexical index
- basic wrong-turn miner
- pi adapter hook layer
- metrics helpers (correctness + wall time + cost + token proxy)

## Install

```bash
npm install
npm run verify
```

### Optional: Bun

This repo is TypeScript-first and Node-compatible. Bun can be used as an
alternative task runner (`bun run ...`) when available.

## Quick usage

```ts
import { createLocalLearningLoop } from "@continua-ai/continua-loop";

const loop = createLocalLearningLoop({ dataDir: ".continua-loop" });

await loop.ingest({
  id: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  sessionId: "session-1",
  harness: "pi",
  scope: "personal",
  type: "tool_result",
  payload: {
    command: "npm test",
    output: "Error: Cannot find module x",
    isError: true,
  },
  metrics: { outcome: "failure" },
});

const hits = await loop.retrieve({ text: "cannot find module" });
console.log(hits[0]);
```

## pi adapter

The pi adapter is intentionally thin and uses a pi-like event API contract.

```ts
import {
  createLocalLearningLoop,
  createPiTraceExtension,
} from "@continua-ai/continua-loop";

const loop = createLocalLearningLoop();
export default createPiTraceExtension({ loop });
```

## Architecture docs

- `docs/architecture.md`
- `docs/metrics.md`
- `docs/engineering-practices.md`

## CI and guardrails

CI runs lint, typecheck, tests, and source-file-size guardrails from day one.

## License

Apache-2.0 (see `LICENSE`).

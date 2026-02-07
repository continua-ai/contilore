# Agent Notes

## Core principles

- Correctness first. Never trade away reliability for lower cost.
- Keep architecture modular: harness adapters and backends remain pluggable.
- Prefer lexical/signature retrieval before semantic/vector retrieval.

## Commands

- `npm run verify`
- `npm run guardrails`
- `npm run build`

## File-size guardrail

- Warning: 1200 LOC
- Failure: 2000 LOC
- Script: `scripts/check-large-source-files.mjs`

## Performance defaults

- Measure first.
- Avoid N+1 I/O.
- Bound concurrency by default.
- Avoid sleep-based polling.

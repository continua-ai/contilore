# Contributing

Thanks for contributing to Happy Paths.

## Local setup

Preferred (Bun-first local development):

```bash
bun install
bun run verify
```

Node/npm remains fully supported:

```bash
npm install
npm run verify
```

## Common commands

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run guardrails
bun run build
```

## Development principles

- correctness first
- small, reviewable PRs
- no secrets in tests/docs
- keep adapters and backends modular

## CI expectations

PRs must pass:

- lint
- typecheck
- tests
- source-size guardrails

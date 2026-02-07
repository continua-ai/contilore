# Contributing

Thanks for contributing to Happy Paths.

## Local setup

```bash
npm install
npm run verify
```

## Common commands

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run guardrails
npm run build
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

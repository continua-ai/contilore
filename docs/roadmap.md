# Roadmap

## Phase 0 (current)

- schema + core interfaces
- local storage/index defaults
- basic wrong-turn miner
- pi adapter
- end-to-end wrong-turn evaluator (capture -> retrieval -> quality metrics)

## Phase 1

- stronger lexical ranking (BM25 / FTS backend)
- near-duplicate clustering for repeated mistakes
- confidence calibration and quality gates

## Phase 2

- optional vector backend plugin
- optional reranker plugin
- path matcher service (intent + context aware retrieval)
- batch/offline mining jobs

## Phase 3

- team scope with explicit sharing controls
- artifact review workflow before publish
- trust/safety pipeline for shared paths (policy checks + sandbox replay)
- public playbook export format

## Phase 4

- additional harness adapters (non-pi)
- benchmark suite with correctness + efficiency reporting

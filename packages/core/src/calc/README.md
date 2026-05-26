# `calc/` — evaluator pipeline

`evaluate(config, series, hints?)` composes **five stages** plus a few orthogonal helpers.

```
calc/
├── evaluate.ts                  ← orchestrator: validate → stages 0..3 → events
├── evaluate.test.ts             ← end-to-end pipeline tests
│
├── pipeline/                    ← one folder per stage, prefix encodes order
│   ├── 0-tick/                  ← Stage 0: samples → ticks
│   │   ├── tick.ts                  dispatcher (chooses a strategy)
│   │   ├── types.ts                 TickConfig, Tick re-export
│   │   ├── strategies/              one file per evaluation mode
│   │   │   ├── passthrough.ts       — when evaluationInterval ≤ 0
│   │   │   ├── range.ts             — model.range:true rules (the main path)
│   │   │   └── instant.ts           — reserved for model.instant:true
│   │   └── window/              strategy-shared algorithms
│   │       ├── schedule.ts          — when do ticks happen?
│   │       ├── sliding-window.ts    — what samples in each tick's window?
│   │       └── reduce-slice.ts      — what value per slice?
│   │
│   ├── 1-classify/              ← Stage 1: ticks → ClassifiedTick[]
│   │   ├── classify.ts              applies the threshold + noDataState
│   │   └── threshold/               threshold operator zoo (Gt, Lt, ...)
│   │
│   ├── 2-group/                 ← Stage 2: ClassifiedTick[] → StateEpisode[]
│   │   └── group.ts                 collapse consecutive same-state ticks
│   │
│   ├── 3-lifecycle/             ← Stage 3: StateEpisode[] → Lifecycle[]
│   │   └── lifecycle.ts             bundle Firing↔NoData runs (for-gate spans)
│   │
│   └── 4-emit/                  ← Stage 4: Lifecycle[] → EvalEvent[]
│       └── emit.ts                  apply for-gate, keepFiringFor, Recovering
│
├── shared/                      ← used across stages (today: by Stage 0 only)
│   ├── reduce/                      Last/Min/Max/Sum/Mean/Count/Median
│   └── nan-mode/                    None/DropNN/ReplaceNN pre/post-reduce policies
│
├── validate/                    ← boundary check on incoming AlertConfig
└── summarize/                   ← post-pipeline stats (cardinalities, durations)
```

## Pipeline data flow

```
AlertConfig + MetricSeries + EvaluatorHints?
        │
        ▼
   validate ────────► Result<Err> short-circuit
        │
        ▼
   0-tick ──── ticks ────► 1-classify ──── classified ────►
   2-group ──── episodes ────► 3-lifecycle ──── lifecycles ────►
   4-emit ──── EvalEvent[] ─► EvalResult
```

The numbered prefix on each `pipeline/` subfolder mirrors the order data flows through them.

## Cross-cutting rules (see `docs/04-grafana-fidelity.md`)

- Every `calc/` function is **pure** and **deterministic** — no `Date.now()`, no closures over external state.
- Every fallible function returns `Result<T, E>`; nothing throws.
- Every `pipeline/` change that affects emitted events must be backed by a recorded-from-real-Grafana fixture under `packages/core/tests/grafana-fidelity/`. No extrapolation.

## Where to look first

| You want to... | Read |
|---|---|
| Understand the whole pipeline | `evaluate.ts` (composition is ~6 lines) |
| Add a reducer | `shared/reduce/reduce.ts` + the spec doc §reducers |
| Add a threshold operator | `pipeline/1-classify/threshold/threshold.ts` |
| Change the tick grid alignment | `pipeline/0-tick/window/schedule.ts` |
| Change Firing↔NoData lifecycle bundling | `pipeline/3-lifecycle/lifecycle.ts` |
| Verify Grafana parity | `packages/core/tests/grafana-fidelity/` |

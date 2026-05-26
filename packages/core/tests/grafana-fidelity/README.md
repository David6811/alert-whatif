# Grafana fidelity fixtures

This directory holds the **verification harness** that proves `packages/core`'s
evaluator behaves like real Grafana, not just like our mental model of Grafana.

The discipline is documented in [`docs/04-grafana-fidelity.md`](../../../../docs/04-grafana-fidelity.md):
**no `calc/` change ships if it breaks a fixture here, and no fixture is
admissible unless its `expected` came from real Grafana.**

## Layout

```
grafana-fidelity/
├── README.md                                       ← you are here
├── fixture-types.ts                                ← schema TS types
├── loader.ts                                       ← reads + parses rule JSON
├── fidelity.test.ts                                ← vitest spec
└── fixtures/
    └── <rule>__<run-date>/                         ← one folder per Grafana run
        ├── alert.json                              ← verbatim Grafana rule JSON
        ├── samples.json                            ← MetricSeries (labels + samples)
        ├── expected.json                           ← observed events + assertions
        └── fixture.json                            ← name, description, provenance
```

Each sub-folder is one Grafana run. The test file iterates every fixture sub-folder
and runs the same assertions against each. The loader runs
`parseGrafanaAlertRule` against `alert.json` at load time, so the rule JSON is the
single source of truth — there is no separately-authored `alertConfig` to drift.

## What's in a fixture

| File | Field | Source |
|---|---|---|
| `alert.json` | (entire file) | Verbatim Grafana v0alpha1 alert rule JSON — the rule the run was recorded against |
| `samples.json` | `labels`, `samples` | PromQL `query_range` API against the **same** Grafana instance the run used |
| `expected.json` | `events` | The full lifecycle Grafana actually exhibited (documentation) |
| `expected.json` | `assertions` | The narrow subset the test actively checks today |
| `fixture.json` | `provenance` | Free-form metadata so any reader can trace every value |
| `fixture.json` | `provenance.knownDivergencesNotAsserted` | Things we deliberately don't assert (yet) — `keep_firing_for`, tick wallclock alignment |

`events` is the full observed lifecycle; `assertions` is what we promise to
match today. Keeping them separate means future tightening (e.g. once
`keep_firing_for` is modelled) lifts an entry from "documented gap" into
"asserted parity" without re-recording.

## How to add a fixture

> Adding a fixture requires a **real Grafana run**. There is no second path.
> If you find yourself reaching for "a small synthetic case" — stop. Run a
> real Grafana session and record from it.

1. **Pick a scenario** with a clean lifecycle (Normal → Pending → Firing → …)
   inside a bounded time window. The first fixture mirrors
   [`alert-replay`'s scenario ①](../../../../../../qr/qrc/grafana/tools/alert-replay/README.md#validated-against-real-grafana).
2. **Record the run** against a Grafana instance you control. Capture two things:
   - The **samples** the rule's query produced (PromQL `query_range` API at the
     rule's effective step). These become `series.samples`.
   - The **state transitions** Grafana produced (preferred: Loki state-history
     API; fallback: live polling of the rules API).
3. **Save the rule JSON verbatim** as `alert.json` inside a new sub-folder
   `fixtures/<rule-uid>__<YYYY-MM-DD>/`. Do not edit it. The loader's
   `parseGrafanaAlertRule` derives the AlertConfig at test time — if the rule
   changes shape (new expression nodes, new threshold ops), extend the parser
   rather than hand-translating fields.
4. **Write the metadata + assertions** as `fixture.json`, `samples.json`, and
   `expected.json` siblings. Conform to [`fixture-types.ts`](./fixture-types.ts).
5. **Document the gaps**: anything Grafana did that our model doesn't currently
   match goes in `provenance.knownDivergencesNotAsserted`. Each entry there is
   work the next 14d audit step needs to do.
6. **Run the suite** — `pnpm --filter @alert-whatif/core test`. New fixture
   should be auto-discovered; assertions should pass for the things we claim
   parity on.

## The first fixture's caveat

[`qrc-demo-range-max__2026-05-09/`](./fixtures/qrc-demo-range-max__2026-05-09/)
was assembled from two different real-Grafana sources:

- `series.samples` — pulled directly from the Grafana Cloud Prometheus API on
  2026-05-12 (samples retained from the May 9 run). Bit-for-bit replay of what
  Grafana's evaluator saw.
- `expected.events` — transcribed from `alert-replay`'s README "Observed
  timeline" table (a live log of the Grafana UI during the May 9 run). The
  state-history API for this rule returns empty (Loki backend not enabled),
  so the README is the only persistent record.

Both halves are real Grafana observations; only the second half went through
human transcription. A future Step 14c-2 will replace `expected.events` with
API-captured state history from a freshly recorded run — at which point this
caveat goes away.

## When this suite is allowed to fail

Never silently. If a fixture starts failing:

- If you changed `calc/`, the failure is **your work** — your change diverged
  the evaluator from Grafana. Either fix the change, or change the fixture's
  assertions only if you can show the fixture is wrong (recorded against the
  wrong rule version, etc.).
- If you didn't change `calc/`, suspect the fixture: was it generated against a
  Grafana version that has since changed? Re-record before editing assertions.

The one thing you may NOT do is loosen tolerances to make a failing test pass.
Loose tolerances hide drift. Keep tolerances pinned to what Grafana actually
exhibits (e.g. the documented ±60s `trigger.interval=1m` jitter), and treat
exceedances as real findings.

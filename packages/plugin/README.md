# Alert What-If — Grafana app plugin

> Replay any Grafana alert rule against the real data Grafana saw, tweak `threshold` / `for` / `interval`, and see what it *would* have done — without touching the live rule.

```
                 any Grafana alert rule
                          │
                          ▼   fetch its PromQL at the rule's own eval cadence
                  the real samples Grafana saw
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
        GRAFANA                      WHAT-IF
    (what it recorded)         (your tweaked params)
            │                           │
            ▼                           ▼
       ▇▇▇▇░░░░▇▇▇                ▇▇░░░░░░▇▇▇▇▇      ← state bars, one time axis
            └─────────── diverge? ──────┘
                         the divergence is the insight
```

You **see** it, not infer it — both the state and the math behind it:

- **State** — the two bars. A gap = runtime beat the rule's definition (e.g. UI rules skip the `query_offset` imported rules get, so the real fire lags the math by one eval cycle — [`docs/06`](https://github.com/credoqr/alert-whatif/blob/main/docs/06-ingestion-lag-feature.md)).
- **Calculations** — a per-tick **Compute trace**: sample slice → reduce → threshold → for-gate. Every state change is *shown*, not asserted.

## Features

- **OverviewStrip drill** — 1h/6h/24h/48h history; click any 🔔 for a 30-min focused view.
- **ParamControls** — edit `threshold` / `for` / `reducer` / `intervalMs` / … → **Apply** re-evaluates. No rule editor.
- **Multi-series picker** — choose which instance to evaluate when the PromQL has un-aggregated labels.
- **Command Palette** — `Cmd-K → "Test alert in alert-whatif"`; pre-fills the rule from its detail page.

## Requirements

Grafana ≥ 12.3.0 · a Prometheus datasource (the one your rules evaluate against) · Viewer role (reads `/api/v1/provisioning/alert-rules` + `/api/annotations`).

## Install

```bash
grafana cli plugins install alertcraft-alertwhatif-app   # then restart Grafana
```

Or **Connections → Add new connection → "Alert What-If" → Install** (Grafana Cloud).

## Use

1. Open via **sidebar → More apps → Alertwhatif**, or `Cmd-K → "Test alert in alert-whatif"`.
2. Pick a rule — the chart loads its last 30 min with both state bars.
3. Scan past firings with the **1h/6h/24h/48h** dropdown; click a 🔔 to drill in.
4. Tweak **Parameters** → **Apply** to re-evaluate.

Full chart walkthrough: [`docs/01-product-vision.md`](https://github.com/credoqr/alert-whatif/blob/main/docs/01-product-vision.md).

## Build & dev

```bash
pnpm install && pnpm -F plugin build   # dist/ = unsigned bundle for local Grafana
```

Local Grafana + Prometheus + sample rules, auto-provisioned: [`docs/plugin/DEPLOY.md`](https://github.com/credoqr/alert-whatif/blob/main/docs/plugin/DEPLOY.md).

## Architecture

A thin Grafana-host adapter over **`@alert-whatif/ui`** (React) on **`@alert-whatif/core`** (framework-agnostic evaluator, verified bit-for-bit against real Grafana via `core/tests/grafana-fidelity/`). Details: [`docs/02-architecture.md`](https://github.com/credoqr/alert-whatif/blob/main/docs/02-architecture.md).

## Issues & License

Bugs → <https://github.com/credoqr/alert-whatif/issues> (for chart bugs include rule UID, the 30-min window in UTC, and a screenshot of both bars). [MIT](https://github.com/credoqr/alert-whatif/blob/main/LICENSE).

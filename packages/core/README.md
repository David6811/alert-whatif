# @alert-whatif/core

Framework-agnostic alert evaluator and scenario library for the [alert-whatif](../../README.md) project.

Pure TypeScript. **No React, no Vue, no Grafana SDK.** Consumed by:

- [`@alert-whatif/plugin`](../plugin) — Grafana App Plugin (React)
- [`@alert-whatif/demo`](../demo) — hosted public demo (Vite + React, mock-only)

Both shells import the same evaluation math from this package, so client-side replay in the demo and server-validated what-if in the plugin can never drift.

## Status

Scaffolding only. No business logic yet. Real evaluation primitives — counter → rate → reducer → threshold → state machine → notification — land in **Step 8** of the [build plan](../../docs/00-build-plan.md), after the product vision, architecture, and MVP scope docs are agreed (Steps 5–7).

## Develop

```bash
pnpm test           # run tests once
pnpm test:watch     # watch mode
pnpm typecheck      # tsc --noEmit
```

## Test stack

[Vitest](https://vitest.dev/) — TypeScript-native, ESM-first, ~3–5× faster than Jest for pure TS packages with an API that is near-identical to Jest's (`describe` / `it` / `expect`).

`@alert-whatif/plugin` uses Jest instead because Grafana's plugin template embeds Jest in its protected `.config/` directory. The two test runners live side-by-side without conflict; the API surface is so similar that contributors moving between packages do not need to context-switch.

## Why a separate package

Because both shells (plugin + demo) need the same math, and because keeping it in a framework-free package is the only way to guarantee no Grafana / React import accidentally creeps in. Every PR touching this package is required to keep it React-free and Grafana-free; the test suite runs in a Node environment with no DOM and no `@grafana/*` import allowed.

## License

[MIT](../../LICENSE)

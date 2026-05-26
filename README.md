# alert-whatif

Tune Grafana alert parameters and see the what-if result on real historical data — before shipping.

Pick an alert rule, change a threshold / reducer / window, and replay it against the
actual metric history to see exactly which points would have fired — faithfully reproducing
Grafana's own evaluation, not an approximation.

## Packages

| Package | Published | Description |
|---|---|---|
| [`@alert-whatif/core`](packages/core) | [npm](https://www.npmjs.com/package/@alert-whatif/core) | Framework-agnostic alert evaluator and scenario library. Pure TypeScript — no React, no Grafana SDK. |
| [`@alert-whatif/ui`](packages/ui) | — | React components for visualising the what-if replay. Depends on `core`. |
| [`@alert-whatif/plugin`](packages/plugin) | — | Grafana app plugin that wires `core` + `ui` into Grafana. |

## Requirements

- Node >= 22
- pnpm 10 (`corepack enable`)

## Develop

```bash
pnpm install        # install the workspace
pnpm build          # build packages that emit (core)
pnpm test           # run unit tests
```

## Run the plugin in Grafana (Docker)

```bash
cd packages/plugin
cp .env.example .env          # fill GC_PROM_URL + GC_PROM_TOKEN
pnpm build                    # webpack → dist  (or `pnpm dev` to watch)
docker compose -f .config/docker-compose-base.yaml up
```

This provisions a Grafana instance with the plugin mounted from `dist/` and a Prometheus
datasource that proxies through Grafana Cloud. Neither your Cloud URL nor token is stored
in the repo — both are injected from `.env` at runtime.

## License

[MIT](LICENSE)

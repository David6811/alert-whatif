// One-shot diagnostic: run evaluate() on the for-gate-boundary fixture and
// compare event timestamps against Grafana's recorded expected.events.
// Not part of the test suite — invoke with:
//   pnpm --filter @alert-whatif/core exec tsx tests/grafana-fidelity/run-for-gate-recording.ts

import { readFileSync } from 'node:fs';
import type { EvalEvent } from '../../src/data/types';
import { evaluate } from '../../src/calc/evaluate';
import { parseGrafanaAlertRule } from '../../src/grafana/parseRule';
import type { MetricSeries } from '../../src/data/types';

const fix = 'tests/grafana-fidelity/fixtures/for-gate-boundary__2026-05-14';
const alert = JSON.parse(readFileSync(`${fix}/alert.json`, 'utf8'));
const series = JSON.parse(readFileSync(`${fix}/samples.json`, 'utf8')) as MetricSeries;
const expected = JSON.parse(readFileSync(`${fix}/expected.json`, 'utf8'));
const meta = JSON.parse(readFileSync(`${fix}/fixture.json`, 'utf8'));

const parsed = parseGrafanaAlertRule(alert);
if (parsed.kind !== 'Ok') {
  console.error('parse error', parsed.errors);
  process.exit(1);
}
const hints =
  typeof meta?.provenance?.evalGridOffsetMs === 'number'
    ? { evalGridOffsetMs: meta.provenance.evalGridOffsetMs }
    : undefined;
console.log(`hints = ${JSON.stringify(hints)}\n`);
const result = evaluate(parsed.value, series, hints);
if (result.kind !== 'Ok') {
  console.error('eval error', result.errors);
  process.exit(1);
}

const fmt = (ms: number) => `${new Date(ms).toISOString()} (${ms})`;

console.log('=== GRAFANA EXPECTED ===');
for (const e of expected.events) {
  if (e.kind === 'Resolved') {
    console.log(`  ${e.kind.padEnd(8)} at=${fmt(e.at)}`);
  } else {
    console.log(`  ${e.kind.padEnd(8)} from=${fmt(e.from)} until=${fmt(e.until)}`);
  }
}

console.log('\n=== alert-whatif ACTUAL ===');
for (const e of result.value.events) {
  if (e.kind === 'Resolved') {
    console.log(`  ${e.kind.padEnd(8)} at=${fmt(e.at)}`);
  } else {
    console.log(`  ${e.kind.padEnd(8)} from=${fmt(e.from)} until=${fmt(e.until)}`);
  }
}

console.log('\n=== DELTA (alert-whatif - grafana, positive = we are later) ===');
for (const exp of expected.events) {
  const ours = result.value.events.find((e: EvalEvent) => e.kind === exp.kind);
  if (!ours) {
    console.log(`  ${exp.kind.padEnd(8)} MISSING in ours`);
    continue;
  }
  if (exp.kind === 'Resolved' && ours.kind === 'Resolved') {
    console.log(`  Resolved.at   delta=${(ours.at - exp.at) / 1000}s`);
  } else if (exp.kind !== 'Resolved' && ours.kind !== 'Resolved') {
    console.log(
      `  ${exp.kind.padEnd(8)}.from  delta=${(ours.from - exp.from) / 1000}s, .until delta=${(ours.until - exp.until) / 1000}s`,
    );
  }
}

console.log('\n=== TICK SCHEDULE (all) ===');
console.log(`  samples first.t = ${fmt(series.samples[0]!.t)}`);
console.log(`  samples last.t  = ${fmt(series.samples[series.samples.length - 1]!.t)}`);
console.log(`  ticks count     = ${result.value.ticks.length}`);
for (const tick of result.value.ticks) {
  const thr = 0.05;
  const pass = tick.kind === 'Data' && tick.v > thr ? 'PASS' : 'fail';
  console.log(`  ${fmt(tick.t)} kind=${tick.kind}${tick.kind === 'Data' ? ` v=${tick.v.toFixed(4)} ${pass}` : ''}`);
}

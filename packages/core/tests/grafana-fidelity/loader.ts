// Filesystem-side loader for Grafana-fidelity fixtures.
//
// Each fixture is a sub-folder under `./fixtures/<name>/` containing four files:
//   alert.json    — verbatim Grafana rule JSON
//   samples.json  — `MetricSeries` (labels + samples)
//   expected.json — events + assertions
//   fixture.json  — metadata (name, description, provenance, file pointers)
//
// `loadFixture` reads all four, runs `parseGrafanaAlertRule` on the rule JSON to derive
// the AlertConfig, and assembles a `GrafanaFidelityFixture`. Shape-checking is
// intentionally narrow: we assert the required top-level fields exist. Field-value
// validation is the calc layer's job (`validateAlertConfig`); parser-level errors are
// surfaced verbatim with the originating fixture name.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGrafanaAlertRule } from '../../src/grafana/parseRule';
import type { FixtureExpected, FixtureMetaJson, GrafanaFidelityFixture } from './fixture-types';
import type { MetricSeries } from '../../src/data/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(HERE, 'fixtures');

export function fixturesDir(): string {
  return FIXTURES_DIR;
}

// A fixture path is the absolute path to a fixture sub-folder (the folder that
// contains fixture.json). The discovery rule: every directory directly under
// `fixtures/` that contains a `fixture.json` is considered a fixture.
export function listFixtureFiles(): ReadonlyArray<string> {
  return readdirSync(FIXTURES_DIR)
    .map((name) => join(FIXTURES_DIR, name))
    .filter((path) => {
      try {
        return statSync(path).isDirectory() && statSync(join(path, 'fixture.json')).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

export function loadFixture(folder: string): GrafanaFidelityFixture {
  const meta = readJson(join(folder, 'fixture.json'), 'fixture.json') as FixtureMetaJson;
  for (const key of ['name', 'description', 'files', 'provenance'] as const) {
    if (!(key in meta)) {
      throw new Error(`fixture ${folder}: fixture.json missing required field "${key}"`);
    }
  }

  const ruleJson = readJson(join(folder, meta.files.alert), meta.files.alert);
  const series = readJson(join(folder, meta.files.samples), meta.files.samples) as MetricSeries;
  const expected = readJson(join(folder, meta.files.expected), meta.files.expected) as FixtureExpected;

  if (!('events' in expected) || !('assertions' in expected)) {
    throw new Error(`fixture ${folder}: ${meta.files.expected} must have events + assertions`);
  }
  for (const key of ['pendingEntryWithinMs', 'firingEntryWithinMs', 'firingEntryOffsetFromPending'] as const) {
    if (!(key in expected.assertions)) {
      throw new Error(`fixture ${folder}: ${meta.files.expected} assertions missing "${key}"`);
    }
  }

  const parsed = parseGrafanaAlertRule(ruleJson);
  if (parsed.kind === 'Err') {
    throw new Error(
      `fixture ${meta.name}: failed to parse ${meta.files.alert} — ${parsed.errors.join('; ')}`,
    );
  }

  return {
    name: meta.name,
    description: meta.description,
    provenance: meta.provenance,
    alertConfig: parsed.value,
    series,
    expected,
  };
}

function readJson(path: string, label: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    throw new Error(`fixture: cannot read ${label} at ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    throw new Error(`fixture: ${label} at ${path} is not valid JSON: ${(e as Error).message}`);
  }
}

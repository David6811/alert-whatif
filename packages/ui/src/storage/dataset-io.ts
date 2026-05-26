// Export / import datasets as JSON (one self-contained Dataset + a version /
// exportedAt envelope). Parse-time validation is strict so a corrupt file
// fails loudly rather than crashing the evaluator later.

import type { AlertConfig, Sample } from '@alert-whatif/core';
import type { Dataset } from '../data/data-source';
import type { RuleMetadata } from '../types';

const CURRENT_VERSION = 1;

type ExportEnvelope = {
  readonly version: 1;
  readonly exportedAt: string;
  readonly dataset: Dataset;
};

export type ImportResult =
  | { readonly kind: 'ok'; readonly dataset: Dataset }
  | { readonly kind: 'err'; readonly error: string };

export function downloadDataset(dataset: Dataset): void {
  const envelope: ExportEnvelope = {
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    dataset,
  };
  const json = JSON.stringify(envelope, null, 2);
  // octet-stream (not application/json) so the browser / Grafana host honors
  // the `download` attribute instead of opening the JSON inline.
  const blob = new Blob([json], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFor(dataset);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke past the tick — synchronous revoke raced the download
  // initiator in some Grafana plugin contexts.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameFor(dataset: Dataset): string {
  const safeId = dataset.id.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `alert-whatif-${safeId}-${stamp}.json`;
}

// Tolerates extra fields, rejects missing/wrong-typed required ones.
export function parseDataset(rawJson: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    return { kind: 'err', error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!isRecord(parsed)) {
    return { kind: 'err', error: 'Root is not an object' };
  }

  if (parsed.version !== CURRENT_VERSION) {
    return {
      kind: 'err',
      error: `Unsupported version: expected ${CURRENT_VERSION}, got ${String(parsed.version)}`,
    };
  }

  if (!isRecord(parsed.dataset)) {
    return { kind: 'err', error: 'Missing or invalid `dataset` field' };
  }

  const validation = validateDataset(parsed.dataset);
  if (validation.kind === 'err') return validation;
  return { kind: 'ok', dataset: validation.dataset };
}

function validateDataset(raw: Record<string, unknown>): ImportResult {
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    return { kind: 'err', error: '`dataset.id` must be a non-empty string' };
  }
  if (typeof raw.displayName !== 'string') {
    return { kind: 'err', error: '`dataset.displayName` must be a string' };
  }
  if (typeof raw.description !== 'string') {
    return { kind: 'err', error: '`dataset.description` must be a string' };
  }
  if (typeof raw.source !== 'string') {
    return { kind: 'err', error: '`dataset.source` must be a string' };
  }
  if (!Array.isArray(raw.samples)) {
    return { kind: 'err', error: '`dataset.samples` must be an array' };
  }
  const samples: Sample[] = [];
  for (let i = 0; i < raw.samples.length; i++) {
    const s: unknown = raw.samples[i];
    if (!isRecord(s) || typeof s.t !== 'number' || typeof s.v !== 'number') {
      return { kind: 'err', error: `\`dataset.samples[${i}]\` must be { t: number, v: number }` };
    }
    samples.push({ t: s.t, v: s.v });
  }
  if (!isRecord(raw.defaultAlertConfig)) {
    return { kind: 'err', error: '`dataset.defaultAlertConfig` must be an object' };
  }
  // No deep AlertConfig validation — evaluate() does its own.
  const defaultAlertConfig = raw.defaultAlertConfig as AlertConfig;

  const dataset: Dataset = {
    id: raw.id,
    displayName: raw.displayName,
    description: raw.description,
    source: raw.source,
    samples,
    defaultAlertConfig,
    ...(typeof raw.rateInnerWindow === 'number' ? { rateInnerWindow: raw.rateInnerWindow } : {}),
    // Round-trip the eval-grid phase so an import lands on the same :phase
    // boundaries as the original capture.
    ...(typeof raw.evalGridOffsetMs === 'number'
      ? { evalGridOffsetMs: raw.evalGridOffsetMs }
      : {}),
    ...(isRecord(raw.ruleMetadata)
      ? { ruleMetadata: raw.ruleMetadata as unknown as RuleMetadata }
      : {}),
  };
  return { kind: 'ok', dataset };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Best-effort localStorage — failures are swallowed (never load-bearing).
const STORAGE_KEY = 'alert-whatif:captured-datasets';

export function loadCapturedDatasets(): ReadonlyArray<Dataset> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Dataset[] = [];
    for (const entry of parsed) {
      if (!isRecord(entry)) continue;
      const validation = validateDataset(entry);
      if (validation.kind === 'ok') out.push(validation.dataset);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCapturedDatasets(datasets: ReadonlyArray<Dataset>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(datasets));
  } catch {
    // Quota exceeded, private mode, etc.
  }
}

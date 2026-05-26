import type { RuleMetadata } from '../types';

// The (datasourceUid, PromQL expr) from the query node — info
// parseGrafanaAlertRule discards. A query node has a real (non-`__expr__`)
// datasourceUID, mirroring core's isQueryNode.
export type RuleQuery = {
  readonly datasourceUid: string;
  readonly expr: string;
};

export function extractRuleQuery(rule: unknown): RuleQuery | null {
  if (typeof rule !== 'object' || rule === null) return null;
  const spec = (rule as { spec?: unknown }).spec;
  if (typeof spec !== 'object' || spec === null) return null;
  const expressions = (spec as { expressions?: unknown }).expressions;
  if (typeof expressions !== 'object' || expressions === null) return null;
  for (const node of Object.values(expressions as Record<string, unknown>)) {
    if (typeof node !== 'object' || node === null) continue;
    const datasourceUid = (node as { datasourceUID?: unknown }).datasourceUID;
    if (typeof datasourceUid !== 'string' || datasourceUid === '__expr__') continue;
    const model = (node as { model?: unknown }).model;
    if (typeof model !== 'object' || model === null) continue;
    const expr = (model as { expr?: unknown }).expr;
    if (typeof expr !== 'string') continue;
    return { datasourceUid, expr };
  }
  return null;
}

// UI-side metadata for ParamControls's read-only sections (math-irrelevant,
// so parseGrafanaAlertRule discards it). null falls back to placeholders.
export function extractRuleMetadata(rule: unknown): RuleMetadata | null {
  if (typeof rule !== 'object' || rule === null) return null;
  const spec = (rule as { spec?: unknown }).spec;
  if (typeof spec !== 'object' || spec === null) return null;

  const title =
    typeof (spec as { title?: unknown }).title === 'string'
      ? ((spec as { title: string }).title)
      : '';

  const rawLabels = (spec as { labels?: unknown }).labels;
  const labels: Record<string, string> = {};
  if (typeof rawLabels === 'object' && rawLabels !== null) {
    for (const [k, v] of Object.entries(rawLabels as Record<string, unknown>)) {
      if (typeof v === 'string') labels[k] = v;
    }
  }

  const paused = (spec as { paused?: unknown }).paused === true;

  const query = extractRuleQuery(rule);
  // Instant query nodes carry `model.instant: true`; default range.
  let mode: 'range' | 'instant' = 'range';
  const exprs = (spec as { expressions?: unknown }).expressions;
  if (typeof exprs === 'object' && exprs !== null) {
    for (const node of Object.values(exprs as Record<string, unknown>)) {
      if (typeof node !== 'object' || node === null) continue;
      const ds = (node as { datasourceUID?: unknown }).datasourceUID;
      if (typeof ds !== 'string' || ds === '__expr__') continue;
      const model = (node as { model?: unknown }).model;
      if (typeof model === 'object' && model !== null) {
        if ((model as { instant?: unknown }).instant === true) mode = 'instant';
      }
      break;
    }
  }

  // `metadata.updated` (ISO-8601) → epoch-ms; OverviewStrip dims bells from
  // before this moment. Skipped when absent / malformed.
  const metaObj = (rule as { metadata?: unknown }).metadata;
  const updatedIso =
    typeof metaObj === 'object' && metaObj !== null
      ? (metaObj as { updated?: unknown }).updated
      : undefined;
  let updatedMs: number | undefined;
  if (typeof updatedIso === 'string') {
    const parsed = Date.parse(updatedIso);
    if (Number.isFinite(parsed)) updatedMs = parsed;
  }

  return {
    title,
    labels,
    paused,
    query: { expr: query?.expr ?? '', mode },
    ...(updatedMs !== undefined ? { updatedMs } : {}),
  };
}


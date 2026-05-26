import type { EvalEvent } from '@alert-whatif/core';

// Build an SVG `<path>` d-string; a gap wider than `gapThresholdMs` becomes a
// move-to (M) instead of line-to (L) so genuine data gaps break the line.
function buildGappedPath<T>(
  points: ReadonlyArray<T>,
  getT: (p: T) => number,
  getV: (p: T) => number,
  xPct: (t: number) => number,
  yPct: (v: number) => number,
  gapThresholdMs: number,
): string {
  let d = '';
  let prevT: number | null = null;
  for (const p of points) {
    const v = getV(p);
    if (!Number.isFinite(v)) continue;
    const t = getT(p);
    const x = xPct(t).toFixed(2);
    const y = yPct(v).toFixed(2);
    const cmd = prevT === null || t - prevT > gapThresholdMs ? 'M' : 'L';
    d += `${cmd}${x},${y} `;
    prevT = t;
  }
  return d.trim();
}

// Filter events by kind, returning a type-narrowed array.
function filterEvents<K extends EvalEvent['kind']>(
  events: ReadonlyArray<EvalEvent>,
  kind: K,
): ReadonlyArray<Extract<EvalEvent, { kind: K }>> {
  return events.filter((e): e is Extract<EvalEvent, { kind: K }> => e.kind === kind);
}

export {
  filterEvents,
  buildGappedPath,
};

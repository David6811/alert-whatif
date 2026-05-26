import { MAX_EVAL_TICKS } from './constants';

function computeEvalTicks(firstT: number, lastT: number, evalInterval: number): number[] {
  if (!Number.isFinite(evalInterval) || evalInterval <= 0) return [];
  const span = lastT - firstT;
  const count = Math.floor(span / evalInterval) + 1;
  if (count > MAX_EVAL_TICKS) return [];
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) ticks.push(firstT + i * evalInterval);
  return ticks;
}

// Eye positions stepping in evalInterval from an on-grid anchor to fill
// [minT, maxT]. May fall outside the sample range — those eyes mark "Grafana
// would evaluate here but there's no data"; visual only, not the state bar.
function computeDisplayTicks(
  anchor: number,
  evalInterval: number,
  minT: number,
  maxT: number,
): number[] {
  if (!Number.isFinite(evalInterval) || evalInterval <= 0) return [];
  const stepsBack = Math.floor((anchor - minT) / evalInterval);
  const firstTick = anchor - stepsBack * evalInterval;
  if (firstTick > maxT) return [];
  const count = Math.floor((maxT - firstTick) / evalInterval) + 1;
  if (count > MAX_EVAL_TICKS) return [];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(firstTick + i * evalInterval);
  return out;
}

// Subdivision grid anchored to absolute multiples of stepMs so a 15s dot lands
// on :15/:30/:45, not a data-relative offset.
function computeSubdivisionTicks(minT: number, maxT: number, stepMs: number): number[] {
  const startMs = Math.ceil(minT / stepMs) * stepMs;
  const endMs = Math.floor(maxT / stepMs) * stepMs;
  const ticks: number[] = [];
  for (let t = startMs; t <= endMs; t += stepMs) ticks.push(t);
  return ticks;
}

// Minute-boundary times snapped to the absolute UTC minute grid (HH:MM:00), so
// a label sits at :00 and an eye at :30 reads as between two labels. Step adapts
// to span to keep ~10–15 labels.
function computeMinuteTicks(minT: number, maxT: number): number[] {
  const spanMin = (maxT - minT) / 60_000;
  const stepMin = spanMin <= 12 ? 1 : spanMin <= 30 ? 2 : spanMin <= 75 ? 5 : 10;
  const stepMs = stepMin * 60_000;
  const startMs = Math.ceil(minT / stepMs) * stepMs;
  const endMs = Math.floor(maxT / stepMs) * stepMs;
  const ticks: number[] = [];
  for (let t = startMs; t <= endMs; t += stepMs) ticks.push(t);
  return ticks;
}

export { computeEvalTicks, computeDisplayTicks, computeSubdivisionTicks, computeMinuteTicks };

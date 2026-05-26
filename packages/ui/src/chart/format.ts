import type { Threshold } from '@alert-whatif/core';

// Chart timestamps render in the browser's local timezone to match Grafana's
// panel display; UTC stays canonical for ids / logs / filenames.
const pad2 = (n: number): string => n.toString().padStart(2, '0');

function formatTime(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatTimeShort(t: number): string {
  const d = new Date(t);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// Full HH:MM:SS so under-marker labels can't be misread as the top-row HH:MM
// axis labels.
function formatSeconds(t: number): string {
  return formatTime(t);
}

// "Nm" at minute boundaries, "M:SS" for sub-minute; handles negative deltas.
function formatTickLabel(deltaMs: number): string {
  const sec = Math.round(deltaMs / 1000);
  const sign = sec < 0 ? '-' : '';
  const abs = Math.abs(sec);
  const min = Math.floor(abs / 60);
  const remSec = abs % 60;
  if (remSec === 0) return `${sign}${min}m`;
  return `${sign}${min}:${String(remSec).padStart(2, '0')}`;
}

function formatThresholdLabelValue(t: Threshold, v: number): string {
  if ('value' in t) return String(v);
  if (v === t.left) return `≥ ${t.left}`;
  return `≤ ${t.right}`;
}

export {
  formatTime,
  formatTimeShort,
  formatSeconds,
  formatTickLabel,
  formatThresholdLabelValue,
};

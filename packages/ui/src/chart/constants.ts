// Chart-area band within the 0..100 SVG; decoration rows and bars live outside
// it via HTML overlays.
export const CHART_TOP_PCT = 26;
export const CHART_BOTTOM_PCT = 86;
// GRAFANA state bar — above ours, thinner (3% vs 5%) so it reads as supplementary.
export const GRAFANA_BAR_TOP_PCT = 88;
export const GRAFANA_BAR_BOTTOM_PCT = 91;
export const STATE_BAR_TOP_PCT = 94;
export const STATE_BAR_BOTTOM_PCT = 99;
// Second event band for the baseline-vs-tweaked comparison.
export const BASELINE_BAR_TOP_PCT = 88;
export const BASELINE_BAR_BOTTOM_PCT = 93;

export const COLOR_LINE = 'var(--chart-line)';
export const COLOR_THRESHOLD = 'var(--chart-threshold)';
export const COLOR_AXIS = 'var(--chart-axis)';
export const COLOR_WINDOW = 'var(--chart-window-highlight)';
// Defaults transparent so the plugin is unchanged; the demo sets it.
export const COLOR_WINDOW_BORDER = 'var(--chart-window-border, transparent)';
export const COLOR_STATE_NORMAL = 'var(--chart-state-normal)';
// Divergence indicator (issue #153) — Grafana's warning-amber.
export const DIVERGENCE_STROKE = 'var(--chart-divergence, #f5a524)';
// Sits above the GRAFANA bar (top = 88%) with breathing room.
export const DIVERGENCE_LABEL_PCT = 85;
export const MAX_EVAL_TICKS = 200;
// Above this, the eye + seconds row is hidden — glyphs would collide.
export const MAX_EYES = 60;
// Visible X span when data is narrower (data centered); 15 min fits the
// reference rule's 2-min `for` + 4-min window with surrounding context.
export const TARGET_CHART_SPAN_MS = 15 * 60 * 1000;
// Pushes Live's "now" inward ~1 min so the playhead doesn't sit on the edge.
export const RIGHT_ANCHOR_PAD_MS = 60 * 1000;

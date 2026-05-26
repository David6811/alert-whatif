import type { CSSProperties } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';

// ─── Styles ──────────────────────────────────────────────────────────────────

// Theme integration: the canonical Page from `@alert-whatif/ui` reads CSS custom
// properties (--bg-page / --text-primary / --event-firing / etc.). `getStyles`
// maps them to Grafana's `GrafanaTheme2` tokens so the chart follows whatever
// theme the user has set (dark, light, or custom). Because it depends on the
// theme it stays a `useStyles2`-style function, not a static stylesheet.
export const getStyles = (theme: GrafanaTheme2) => ({
  container: css`
    color-scheme: ${theme.isDark ? 'dark' : 'light'};

    --bg-page: ${theme.colors.background.canvas};
    --bg-card: ${theme.colors.background.primary};
    --bg-tile: ${theme.colors.background.primary};
    --bg-tile-empty: ${theme.colors.background.secondary};
    --bg-input: ${theme.components.input.background};
    --bg-button: ${theme.colors.background.secondary};
    --bg-button-hover: ${theme.colors.action.hover};

    --border-card: ${theme.colors.border.weak};
    --border-dashed: ${theme.colors.border.medium};
    --border-tile: ${theme.colors.border.weak};
    --border-input: ${theme.components.input.borderColor};

    --text-primary: ${theme.colors.text.primary};
    --text-muted: ${theme.colors.text.secondary};
    --text-faded: ${theme.colors.text.disabled};
    --text-link: ${theme.colors.text.link};
    --text-on-card: ${theme.colors.text.primary};
    --text-error: ${theme.colors.error.text};

    --chart-line: ${theme.visualization.getColorByName('purple')};
    --chart-threshold: ${theme.colors.error.main};
    --chart-axis: ${theme.colors.border.weak};
    --chart-axis-text: ${theme.colors.text.secondary};
    --chart-window-highlight: ${theme.colors.primary.transparent};
    --chart-state-normal: ${theme.colors.background.secondary};
    --chart-cond-pass: ${theme.colors.error.main};
    --chart-cond-fail: ${theme.colors.background.secondary};
    --chart-crossing-marker: ${theme.colors.warning.main};

    /* Event colors keep semantic mapping to Grafana's standard alert
       palette (warning = pending, error = firing, etc.) so a Grafana
       admin doesn't have to learn a new color vocabulary. */
    --event-pending: ${theme.colors.warning.main};
    --event-firing: ${theme.colors.error.main};
    --event-recovering: ${theme.colors.warning.shade};
    --event-nodata: ${theme.colors.info.main};
    --event-resolved: ${theme.colors.success.main};
    --event-band-opacity: 0.28;

    display: flex;
    flex-direction: column;
    /* 100% so we fill whatever vertical slot Grafana hands us under
       PageLayoutType.Custom (= total viewport minus the breadcrumb
       topbar). The canonical Page's pageStyle inside also uses 100%
       so it inherits the same height. */
    height: 100%;
    width: 100%;

    & select,
    & input[type='text'],
    & input[type='number'],
    & input[type='checkbox'] {
      background: var(--bg-input) !important;
      color: var(--text-primary) !important;
      border: 1px solid var(--border-input) !important;
      border-radius: 4px;
      appearance: auto;
    }
    & select:disabled,
    & input:disabled {
      color: var(--text-faded) !important;
      opacity: 0.7;
    }
    & select option {
      background: var(--bg-card);
      color: var(--text-primary);
    }
  `,
});

export const logoImgStyle: CSSProperties = {
  width: '1.2rem',
  height: '1.2rem',
  verticalAlign: 'middle',
};

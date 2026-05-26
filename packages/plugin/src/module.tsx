import React, { Suspense, lazy } from 'react';
import { AppPlugin, PluginExtensionPoints, type AppRootProps } from '@grafana/data';
import { LoadingPlaceholder } from '@grafana/ui';

const LazyApp = lazy(() => import('./components/App/App'));

const App = (props: AppRootProps) => (
  <Suspense fallback={<LoadingPlaceholder text="" />}>
    <LazyApp {...props} />
  </Suspense>
);

// Pulls the alert rule UID out of `/alerting/grafana/<uid>/view` URLs so
// Command-Palette invocations from an alert rule detail page can deep-link
// us into a pre-populated WhatIfPage. Returns null on any other path.
function ruleUidFromCurrentLocation(): string | null {
  if (typeof window === 'undefined') {return null;}
  const match = window.location.pathname.match(/^\/alerting\/grafana\/([^/]+)\/view\/?$/);
  return match?.[1] ?? null;
}

const WHATIF_BASE_PATH = '/a/alertcraft-alertwhatif-app/whatif';

// CommandPalette link is the actually-wired entry point. Cmd+K (or
// the top-bar search icon) → type "alert-whatif" → click. If the user
// happens to be on an alert rule detail page, we encode the rule UID
// in the URL so WhatIfPage can fetch + prefill. Verified empirically
// that `AlertingAlertingRuleAction` / `MegaMenuAction` /
// `SingleTopBarAction` are declared in @grafana/data@12.4.2 but not
// actually consumed by any UI — only CommandPalette is.
export const plugin = new AppPlugin<{}>()
  .setRootPage(App)
  .addLink({
    targets: [PluginExtensionPoints.CommandPalette],
    title: 'Test alert in alert-whatif',
    description:
      'Open the pasted rule in alert-whatif and see what it would have done on real historical data.',
    path: WHATIF_BASE_PATH,
    configure: () => {
      const uid = ruleUidFromCurrentLocation();
      return uid !== null ? { path: `${WHATIF_BASE_PATH}?fromRule=${encodeURIComponent(uid)}` } : {};
    },
  });

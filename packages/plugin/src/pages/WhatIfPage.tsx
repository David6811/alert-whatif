// Plugin's outer shell — a thin wrapper that mounts the canonical
// `@alert-whatif/ui` WhatIfPage. `PageLayoutType.Custom` drops Grafana's
// default page chrome (title + logo header) so the canonical Page's own
// header carries the branding and the 100vh chart layout fits without
// scrolling. Theming lives in ./styles (getStyles maps GrafanaTheme2 → the
// CSS custom properties the canonical Page reads).

import React, { useState } from 'react';
import { locationService, PluginPage } from '@grafana/runtime';
import { useStyles2 } from '@grafana/ui';
import { PageLayoutType } from '@grafana/data';
import { WhatIfPage as CanonicalWhatIfPage } from '@alert-whatif/ui';
import { testIds } from '../components/testIds';
import { grafanaAdapter } from '../adapter';
import { getStyles, logoImgStyle } from './styles';

const PLUGIN_LOGO_URL = '/public/plugins/pantrypulse-alertwhatif-app/img/logo.png';

type DeepLinkProps = Pick<
  React.ComponentProps<typeof CanonicalWhatIfPage>,
  'initialRuleUid' | 'initialLookbackSec' | 'initialDrill' | 'initialPlay'
>;

// One-time read of the `?fromRule/lookback/drill/play` deep link, keeping only
// the keys that are present and valid so absent params stay truly unset.
function readDeepLinkProps(): DeepLinkProps {
  const q = locationService.getSearch();
  const fromRule = q.get('fromRule') ?? '';
  const lookback = Number(q.get('lookback'));
  const drill = q.get('drill');
  const play = q.get('play');
  return {
    ...(fromRule ? { initialRuleUid: fromRule } : {}),
    ...(Number.isFinite(lookback) && lookback > 0 ? { initialLookbackSec: lookback } : {}),
    ...(drill === 'first' || drill === 'last' ? { initialDrill: drill } : {}),
    ...(play === '1' || play === 'true' ? { initialPlay: true } : {}),
  };
}

function WhatIfPage() {
  const s = useStyles2(getStyles);
  const [deepLink] = useState(readDeepLinkProps);

  return (
    <PluginPage layout={PageLayoutType.Custom}>
      <div data-testid={testIds.whatIfPage.container} className={`alert-whatif-plugin ${s.container}`}>
        <CanonicalWhatIfPage
          adapter={grafanaAdapter}
          titleLogo={<img src={PLUGIN_LOGO_URL} alt="" style={logoImgStyle} />}
          {...deepLink}
        />
      </div>
    </PluginPage>
  );
}

export default WhatIfPage;

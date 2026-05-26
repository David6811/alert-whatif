import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppRootProps } from '@grafana/data';

const WhatIfPage = React.lazy(() => import('../../pages/WhatIfPage'));

// Single-page app for v0.x. The plugin has one job (pick a rule →
// run evaluate → show what would have happened), so any URL just
// lands on WhatIfPage. `_props` swallows the AppRootProps we don't
// yet consume; basename / meta are available from the parent if a
// future page needs them.
function App(_props: AppRootProps) {
  return (
    <Routes>
      <Route path="*" element={<WhatIfPage />} />
    </Routes>
  );
}

export default App;

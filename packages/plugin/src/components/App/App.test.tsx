import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppRootProps, PluginType } from '@grafana/data';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import { testIds } from '../testIds';

describe('Components/App', () => {
  let props: AppRootProps;

  beforeEach(() => {
    jest.resetAllMocks();

    props = {
      basename: 'a/sample-app',
      meta: {
        id: 'sample-app',
        name: 'Sample App',
        type: PluginType.app,
        enabled: true,
        jsonData: {},
      },
      query: {},
      path: '',
      onNavChanged: jest.fn(),
    } as unknown as AppRootProps;
  });

  test('renders without an error"', async () => {
    const { container } = render(
      <MemoryRouter>
        <App {...props} />
      </MemoryRouter>
    );

    // Application is lazy loaded — wait for the WhatIfPage container to
    // mount. The data-testid is set on the wrapper div directly so it
    // appears as soon as the lazy chunk loads, independent of async
    // rule-list fetches inside the canonical Page.
    await waitFor(
      () =>
        expect(
          container.querySelector(`[data-testid="${testIds.whatIfPage.container}"]`),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
  }, 15000);
});

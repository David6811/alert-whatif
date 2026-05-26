// Math-irrelevant alert.json fields the Parameters UI displays.
export type RuleMetadata = {
  readonly title: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly paused: boolean;
  readonly query: {
    readonly expr: string;
    readonly mode: 'range' | 'instant';
  };
  // Epoch-ms of `metadata.updated`; OverviewStrip dims bells from before this
  // moment (Grafana wasn't monitoring, so no annotations to drill into).
  readonly updatedMs?: number;
};

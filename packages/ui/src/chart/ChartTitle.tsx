import React from 'react';
import {
  chartTitleWrapStyle,
  chartTitleMainStyle,
  chartTitleSubStyle,
  chartTitleSpacerStyle,
  chartTitleRangeStyle,
} from './styles';

export function ChartTitle({
  subtitle,
  timeRange,
}: {
  readonly subtitle: string;
  readonly timeRange: string | undefined;
}) {
  return (
    <div style={chartTitleWrapStyle}>
      <span style={chartTitleMainStyle}>Alert lifecycle</span>
      {subtitle.length > 0 ? <span style={chartTitleSubStyle}>{subtitle}</span> : null}
      {timeRange !== undefined ? (
        <>
          <div style={chartTitleSpacerStyle} />
          <span style={chartTitleRangeStyle}>{timeRange}</span>
        </>
      ) : null}
    </div>
  );
}

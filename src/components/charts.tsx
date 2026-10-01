// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Chart components for the dashboard and metrics pages.
 *
 * Two deliberate choices:
 *
 * - Throughput and rejections are plotted separately rather than on one chart
 *   with two y-scales. Requests run in the hundreds per second while drops and
 *   KoD responses run in single digits, so a shared axis would flatten the
 *   rejection series into the baseline and a second axis would invent a
 *   correlation that is not in the data.
 * - Series colors come from the Cloudscape categorical palette rather than
 *   hardcoded hex values, so they stay consistent and keep working when the
 *   operator switches to dark mode.
 */

import AreaChart from '@cloudscape-design/components/area-chart';
import BarChart from '@cloudscape-design/components/bar-chart';
import Box from '@cloudscape-design/components/box';
import LineChart from '@cloudscape-design/components/line-chart';

import type { MetricSample, MetricsSnapshot } from '../api/types';
import { formatClockTime, formatCount } from '../utils/format';

/** Shared empty and loading states so every chart behaves the same way. */
const CHART_STATES = {
  empty: (
    <Box textAlign="center" color="inherit">
      <b>No data</b>
      <Box variant="p" color="inherit">
        There is no data to display.
      </Box>
    </Box>
  ),
  noMatch: (
    <Box textAlign="center" color="inherit">
      <b>No matching data</b>
      <Box variant="p" color="inherit">
        No data falls within the selected range.
      </Box>
    </Box>
  ),
};

const X_AXIS_LABEL = 'Time (UTC)';

/** Common i18n strings for the chart filter and legend controls. */
const I18N = {
  filterLabel: 'Filter displayed series',
  filterPlaceholder: 'Filter data',
  legendAriaLabel: 'Legend',
  chartAriaRoleDescription: 'line chart',
  xAxisAriaRoleDescription: 'time',
  yAxisAriaRoleDescription: 'rate',
  detailPopoverDismissAriaLabel: 'Dismiss',
};

/**
 * Request and response throughput over time.
 *
 * Two series on one axis, both measured in requests per second, so they are
 * directly comparable - the gap between them is the rejection rate.
 */
export function ThroughputChart({
  samples,
  height = 260,
}: {
  samples: MetricSample[];
  height?: number;
}) {
  return (
    <LineChart
      series={[
        {
          title: 'Requests received',
          type: 'line',
          data: samples.map((sample) => ({
            x: new Date(sample.timestamp),
            y: sample.requests_per_sec,
          })),
          valueFormatter: (value: number) => `${formatCount(value)} req/s`,
        },
        {
          title: 'Responses sent',
          type: 'line',
          data: samples.map((sample) => ({
            x: new Date(sample.timestamp),
            y: sample.responses_per_sec,
          })),
          valueFormatter: (value: number) => `${formatCount(value)} resp/s`,
        },
      ]}
      xDomain={
        samples.length > 0
          ? [new Date(samples[0].timestamp), new Date(samples[samples.length - 1].timestamp)]
          : undefined
      }
      xScaleType="time"
      height={height}
      xTitle={X_AXIS_LABEL}
      yTitle="Packets per second"
      i18nStrings={{
        ...I18N,
        xTickFormatter: (value: Date) => formatClockTime(value.getTime()),
        yTickFormatter: (value: number) => formatCount(value),
      }}
      ariaLabel="NTP request and response throughput over time"
      empty={CHART_STATES.empty}
      noMatch={CHART_STATES.noMatch}
      hideFilter
    />
  );
}

/**
 * Rejected traffic over time: dropped packets and Kiss-o-Death responses.
 *
 * Separate from the throughput chart because these run two to three orders of
 * magnitude lower. Stacked, since both are kinds of the same thing - a request
 * that did not get a normal response.
 */
export function RejectionChart({
  samples,
  height = 260,
}: {
  samples: MetricSample[];
  height?: number;
}) {
  return (
    <AreaChart
      series={[
        {
          title: 'Dropped (malformed)',
          type: 'area',
          data: samples.map((sample) => ({
            x: new Date(sample.timestamp),
            y: sample.dropped_per_sec,
          })),
          valueFormatter: (value: number) => `${formatCount(value)}/s`,
        },
        {
          title: 'Kiss-o-Death sent',
          type: 'area',
          data: samples.map((sample) => ({
            x: new Date(sample.timestamp),
            y: sample.kod_per_sec,
          })),
          valueFormatter: (value: number) => `${formatCount(value)}/s`,
        },
      ]}
      xDomain={
        samples.length > 0
          ? [new Date(samples[0].timestamp), new Date(samples[samples.length - 1].timestamp)]
          : undefined
      }
      xScaleType="time"
      height={height}
      xTitle={X_AXIS_LABEL}
      yTitle="Packets per second"
      i18nStrings={{
        ...I18N,
        chartAriaRoleDescription: 'area chart',
        xTickFormatter: (value: Date) => formatClockTime(value.getTime()),
        yTickFormatter: (value: number) => formatCount(value),
      }}
      ariaLabel="Dropped packets and Kiss-o-Death responses over time"
      empty={CHART_STATES.empty}
      noMatch={CHART_STATES.noMatch}
      hideFilter
    />
  );
}

/**
 * Kiss-o-Death responses broken down by kind.
 *
 * A bar chart rather than a pie: the three kinds differ by more than an order of
 * magnitude, and bars let an operator read the actual counts.
 */
export function KodBreakdownChart({
  metrics,
  height = 220,
}: {
  metrics: MetricsSnapshot;
  height?: number;
}) {
  return (
    <BarChart
      series={[
        {
          title: 'Responses sent',
          type: 'bar',
          data: [
            { x: 'RATE (rate limited)', y: metrics.kod_rate_sent },
            { x: 'DENY (access denied)', y: metrics.kod_deny_sent },
            { x: 'RSTR (restricted)', y: metrics.kod_rstr_sent },
          ],
          valueFormatter: (value: number) => formatCount(value),
        },
      ]}
      horizontalBars
      height={height}
      xTitle="Kiss-o-Death kind"
      yTitle="Responses sent"
      i18nStrings={{
        ...I18N,
        chartAriaRoleDescription: 'bar chart',
        xAxisAriaRoleDescription: 'Kiss-o-Death kind',
        yAxisAriaRoleDescription: 'count',
        yTickFormatter: (value: number) => formatCount(value),
      }}
      ariaLabel="Kiss-o-Death responses by kind"
      empty={CHART_STATES.empty}
      noMatch={CHART_STATES.noMatch}
      hideFilter
      // One series: the chart title already names it, so a legend box adds nothing.
      hideLegend
    />
  );
}

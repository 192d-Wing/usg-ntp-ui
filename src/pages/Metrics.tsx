// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Every counter the server exposes, as charts and as a table.
 *
 * The table is not redundant with the charts: it is the accessible reading of
 * the same data, and it gives exact cumulative values that a plot cannot.
 */

import { useCallback, useMemo } from 'react';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Grid from '@cloudscape-design/components/grid';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';

import { api } from '../api/client';
import { useResource } from '../api/hooks';
import type { MetricsSnapshot } from '../api/types';
import { KodBreakdownChart, RejectionChart, ThroughputChart } from '../components/charts';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import { InfoLink } from '../components/primitives';
import { formatCount, formatPercent } from '../utils/format';

const POLL_MS = 5000;

/** One row of the counter table. */
interface CounterRow {
  key: string;
  name: string;
  value: number;
  share: string;
  description: string;
}

function buildRows(metrics: MetricsSnapshot): CounterRow[] {
  const total = metrics.requests_received;
  return [
    {
      key: 'requests_received',
      name: 'Requests received',
      value: metrics.requests_received,
      share: '100.0%',
      description: 'Every NTP packet the server read from the socket, valid or not.',
    },
    {
      key: 'responses_sent',
      name: 'Responses sent',
      value: metrics.responses_sent,
      share: formatPercent(metrics.responses_sent, total),
      description: 'Requests answered with a normal time response.',
    },
    {
      key: 'requests_dropped',
      name: 'Requests dropped',
      value: metrics.requests_dropped,
      share: formatPercent(metrics.requests_dropped, total),
      description: 'Packets discarded as malformed or too short to parse.',
    },
    {
      key: 'kod_rate_sent',
      name: 'KoD RATE sent',
      value: metrics.kod_rate_sent,
      share: formatPercent(metrics.kod_rate_sent, total),
      description: 'Clients refused for exceeding their rate limit.',
    },
    {
      key: 'kod_deny_sent',
      name: 'KoD DENY sent',
      value: metrics.kod_deny_sent,
      share: formatPercent(metrics.kod_deny_sent, total),
      description: 'Clients refused by the deny list.',
    },
    {
      key: 'kod_rstr_sent',
      name: 'KoD RSTR sent',
      value: metrics.kod_rstr_sent,
      share: formatPercent(metrics.kod_rstr_sent, total),
      description: 'Clients refused for falling outside the allow list.',
    },
    {
      key: 'interleaved_responses',
      name: 'Interleaved responses',
      value: metrics.interleaved_responses,
      share: formatPercent(metrics.interleaved_responses, total),
      description: 'Responses served in interleaved mode (RFC 9769).',
    },
    {
      key: 'active_clients',
      name: 'Active clients',
      value: metrics.active_clients,
      share: '--',
      description: 'Current entries in the client table. This is a gauge, not a total.',
    },
  ];
}

export function Metrics() {
  const openHelp = useOpenHelp();
  usePageHelp(<MetricsHelp />);

  const metricsFetcher = useCallback(() => api.getMetrics(), []);
  const historyFetcher = useCallback(() => api.getMetricsHistory(), []);

  const metrics = useResource(metricsFetcher, POLL_MS);
  const history = useResource(historyFetcher, POLL_MS);

  const rows = useMemo(() => (metrics.data ? buildRows(metrics.data) : []), [metrics.data]);
  const samples = history.data ?? [];

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Request counters and rates since the server process started."
          actions={
            <Button
              iconName="refresh"
              ariaLabel="Refresh metrics"
              onClick={() => {
                metrics.refresh();
                history.refresh();
              }}
            />
          }
        >
          Metrics
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Container
          header={
            <Header variant="h2" description="Requests received against responses sent.">
              Throughput
            </Header>
          }
        >
          <ThroughputChart samples={samples} height={300} />
        </Container>

        <Grid
          gridDefinition={[{ colspan: { default: 12, s: 7 } }, { colspan: { default: 12, s: 5 } }]}
        >
          <Container
            header={
              <Header
                variant="h2"
                description="Requests that did not receive a normal response."
              >
                Rejected traffic
              </Header>
            }
          >
            <RejectionChart samples={samples} height={280} />
          </Container>

          <Container
            header={
              <Header variant="h2" description="Cumulative refusals by kind.">
                Kiss-o-Death
              </Header>
            }
          >
            {metrics.data ? <KodBreakdownChart metrics={metrics.data} height={280} /> : null}
          </Container>
        </Grid>

        <Table
          items={rows}
          loading={metrics.loading && !metrics.data}
          loadingText="Loading metrics"
          trackBy="key"
          variant="container"
          wrapLines
          columnDefinitions={[
            {
              id: 'name',
              header: 'Counter',
              cell: (item) => item.name,
              isRowHeader: true,
              minWidth: 200,
            },
            {
              id: 'value',
              header: 'Value',
              cell: (item) => (
                <Box variant="span" fontWeight="bold">
                  {formatCount(item.value)}
                </Box>
              ),
              minWidth: 140,
            },
            {
              id: 'share',
              header: 'Share of requests',
              cell: (item) => item.share,
              minWidth: 150,
            },
            {
              id: 'description',
              header: 'Meaning',
              cell: (item) => item.description,
              minWidth: 320,
            },
          ]}
          header={
            <Header
              variant="h2"
              description="Exact values, for the same data shown in the charts above."
            >
              All counters
            </Header>
          }
          empty={
            <Box textAlign="center" padding="l" color="inherit">
              <b>No metrics</b>
              <Box variant="p" color="inherit">
                The server has not reported any counters.
              </Box>
            </Box>
          }
          ariaLabels={{ tableLabel: 'Server metric counters' }}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}

function MetricsHelp() {
  return (
    <HelpPanel header={<h2>Metrics</h2>}>
      <p>
        The server keeps these counters as lock-free atomics updated on the request hot path.
        Values are read with relaxed ordering, so a snapshot taken under heavy load may be off by
        a handful of requests across counters. That is by design - it keeps the measurement from
        slowing down the thing it measures.
      </p>
      <h3>Counters vs gauges</h3>
      <p>
        Every row except <b>Active clients</b> is a monotonic total since the process started.
        Active clients is a gauge: the size of the client table right now.
      </p>
      <h3>Why the shares do not sum to 100%</h3>
      <p>
        <b>Interleaved responses</b> is a subset of <b>Responses sent</b>, not a separate outcome.
        The outcomes that do partition the request total are responses sent, requests dropped, and
        the three Kiss-o-Death counters.
      </p>
      <h3>Rates</h3>
      <p>
        The charts show per-second rates derived from successive snapshots at five second
        intervals. A brief gap in the series means a poll did not complete, not that traffic
        stopped.
      </p>
    </HelpPanel>
  );
}

// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Service overview: health, throughput, and the current clock state. */

import { useCallback } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Grid from '@cloudscape-design/components/grid';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';

import { api, transport } from '../api/client';
import { useNow, useResource } from '../api/hooks';
import { KodBreakdownChart, RejectionChart, ThroughputChart } from '../components/charts';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import {
  EnabledIndicator,
  InfoLink,
  RouteLink,
  ServiceStateIndicator,
  StatTile,
  ValueWithLabel,
} from '../components/primitives';
import {
  formatCompact,
  formatCount,
  formatLeapIndicator,
  formatPercent,
  formatRate,
  formatRelative,
  formatSeconds,
  formatStratum,
  formatUptime,
} from '../utils/format';

/** How often the dashboard re-reads the server, in milliseconds. */
const POLL_MS = 5000;

export function Dashboard() {
  const openHelp = useOpenHelp();
  usePageHelp(<DashboardHelp />);

  const statusFetcher = useCallback(() => api.getStatus(), []);
  const metricsFetcher = useCallback(() => api.getMetrics(), []);
  const historyFetcher = useCallback(() => api.getMetricsHistory(), []);
  const eventsFetcher = useCallback(() => api.getEvents(), []);

  const status = useResource(statusFetcher, POLL_MS);
  const metrics = useResource(metricsFetcher, POLL_MS);
  const history = useResource(historyFetcher, POLL_MS);
  const events = useResource(eventsFetcher, POLL_MS);

  const samples = history.data ?? [];
  const latest = samples.at(-1);
  const loadError = status.error ?? metrics.error ?? history.error;

  // Drives the relative timestamps on the recent events list.
  const now = useNow();

  return (
    <ContentLayout
      header={
        <SpaceBetween size="m">
          <Header
            variant="h1"
            info={<InfoLink onFollow={openHelp} />}
            description="Current health and request throughput of the ntp_usg time service."
            actions={
              status.data ? <ServiceStateIndicator state={status.data.state} /> : null
            }
          >
            Dashboard
          </Header>
          {transport === 'mock' ? (
            <Alert type="info" header="Showing simulated data">
              No management API is configured, so this console is running against an in-memory
              simulation. Set <Box variant="code">VITE_API_BASE_URL</Box> to point it at a live
              ntp_usg server.
            </Alert>
          ) : null}
        </SpaceBetween>
      }
    >
      <SpaceBetween size="l">
        {loadError ? (
          <Alert
            type="error"
            header="Could not load server data"
            action={
              <Link
                onFollow={() => {
                  status.refresh();
                  metrics.refresh();
                  history.refresh();
                }}
              >
                Retry
              </Link>
            }
          >
            {loadError}
          </Alert>
        ) : null}

        <Container header={<Header variant="h2">Traffic</Header>}>
          {metrics.loading && !metrics.data ? (
            <Box textAlign="center" padding="l">
              <Spinner size="large" />
            </Box>
          ) : metrics.data ? (
            <ColumnLayout columns={4} variant="text-grid" minColumnWidth={200}>
              <StatTile
                label="Request rate"
                value={latest ? formatRate(latest.requests_per_sec) : '--'}
                secondary="Averaged over the last 5 seconds"
              />
              <StatTile
                label="Requests received"
                value={formatCompact(metrics.data.requests_received)}
                secondary={`${formatCount(metrics.data.requests_received)} since start`}
              />
              <StatTile
                label="Responses sent"
                value={formatCompact(metrics.data.responses_sent)}
                secondary={`${formatPercent(
                  metrics.data.responses_sent,
                  metrics.data.requests_received,
                )} of requests answered`}
              />
              <StatTile
                label="Active clients"
                value={formatCount(metrics.data.active_clients)}
                secondary="Entries in the client table"
              />
            </ColumnLayout>
          ) : null}
        </Container>

        <Grid gridDefinition={[{ colspan: { default: 12, s: 8 } }, { colspan: { default: 12, s: 4 } }]}>
          <Container
            header={
              <Header variant="h2" description="Requests received against responses sent.">
                Throughput
              </Header>
            }
          >
            <ThroughputChart samples={samples} />
          </Container>

          <Container
            header={
              <Header
                variant="h2"
                description="Clock identity reported in every response."
              >
                Clock state
              </Header>
            }
          >
            {status.data ? (
              <SpaceBetween size="l">
                <ValueWithLabel label="Stratum">
                  {formatStratum(status.data.stratum)}
                </ValueWithLabel>
                <ValueWithLabel label="Reference ID">
                  <Box variant="code">{status.data.reference_id}</Box>
                </ValueWithLabel>
                <ValueWithLabel label="Leap indicator">
                  <StatusIndicator
                    type={status.data.leap_indicator === 'no_warning' ? 'success' : 'warning'}
                  >
                    {formatLeapIndicator(status.data.leap_indicator)}
                  </StatusIndicator>
                </ValueWithLabel>
                <ValueWithLabel label="Root dispersion">
                  {formatSeconds(status.data.root_dispersion)}
                </ValueWithLabel>
                <ValueWithLabel label="Precision">
                  2^{status.data.precision} s ({formatSeconds(2 ** status.data.precision)})
                </ValueWithLabel>
                <ValueWithLabel label="Uptime">
                  {formatUptime(status.data.uptime_secs)}
                </ValueWithLabel>
              </SpaceBetween>
            ) : (
              <Box textAlign="center" padding="l">
                <Spinner size="large" />
              </Box>
            )}
          </Container>
        </Grid>

        <Grid gridDefinition={[{ colspan: { default: 12, s: 6 } }, { colspan: { default: 12, s: 6 } }]}>
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
            <RejectionChart samples={samples} />
          </Container>

          <Container
            header={
              <Header
                variant="h2"
                description="Cumulative Kiss-o-Death responses by kind."
                actions={<RouteLink to="/rate-limiting">Rate limiting</RouteLink>}
              >
                Kiss-o-Death
              </Header>
            }
          >
            {metrics.data ? (
              <KodBreakdownChart metrics={metrics.data} />
            ) : (
              <Box textAlign="center" padding="l">
                <Spinner size="large" />
              </Box>
            )}
          </Container>
        </Grid>

        <Container
          header={
            <Header variant="h2" description="Sockets the server is bound to.">
              Listeners
            </Header>
          }
        >
          {status.data ? (
            <ColumnLayout columns={2} variant="text-grid">
              {status.data.listeners.map((listener) => (
                <ValueWithLabel
                  key={`${listener.protocol}-${listener.address}`}
                  label={listener.protocol === 'ntp-udp' ? 'NTP (UDP)' : 'NTS-KE (TCP)'}
                >
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Box variant="code">{listener.address}</Box>
                    <EnabledIndicator
                      enabled={listener.healthy}
                      enabledLabel="Healthy"
                      disabledLabel="Not listening"
                    />
                  </SpaceBetween>
                </ValueWithLabel>
              ))}
            </ColumnLayout>
          ) : null}
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Cargo features compiled into the running build."
              counter={status.data ? `(${status.data.enabled_features.length})` : undefined}
            >
              Enabled features
            </Header>
          }
        >
          {status.data ? (
            <SpaceBetween size="xs" direction="horizontal">
              {status.data.enabled_features.map((feature) => (
                <Badge key={feature}>{feature}</Badge>
              ))}
            </SpaceBetween>
          ) : null}
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Most recent entries from the server log."
              actions={<RouteLink to="/events">View all events</RouteLink>}
            >
              Recent events
            </Header>
          }
        >
          {events.data && events.data.length > 0 ? (
            <SpaceBetween size="s">
              {events.data.slice(0, 5).map((event) => (
                <Box key={event.id}>
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <Box variant="small" color="text-body-secondary">
                      {formatRelative(event.timestamp, now)}
                    </Box>
                    <Box variant="code">{event.target}</Box>
                  </SpaceBetween>
                  <Box>{event.message}</Box>
                </Box>
              ))}
            </SpaceBetween>
          ) : (
            <Box color="text-body-secondary">No events recorded yet.</Box>
          )}
        </Container>
      </SpaceBetween>
    </ContentLayout>
  );
}

function DashboardHelp() {
  return (
    <HelpPanel header={<h2>Dashboard</h2>}>
      <p>
        This page polls the server every five seconds. Cumulative counters such as{' '}
        <b>Requests received</b> are monotonic since the process started, while the charts show a
        per-second rate derived from the difference between samples.
      </p>
      <h3>Reading the throughput chart</h3>
      <p>
        The gap between <b>Requests received</b> and <b>Responses sent</b> is traffic the server
        refused: malformed packets it dropped, plus Kiss-o-Death responses. A persistent gap is
        worth investigating on the <b>Rejected traffic</b> chart.
      </p>
      <h3>Kiss-o-Death kinds</h3>
      <ul>
        <li>
          <b>RATE</b> - the client exceeded its rate limit.
        </li>
        <li>
          <b>DENY</b> - the client address matched the deny list.
        </li>
        <li>
          <b>RSTR</b> - the client address fell outside the allow list.
        </li>
      </ul>
      <h3>Stratum</h3>
      <p>
        Stratum 1 means the server is attached to a primary reference such as GPS or PPS.
        Stratum 16 means the clock is unsynchronized and clients should not trust it.
      </p>
    </HelpPanel>
  );
}

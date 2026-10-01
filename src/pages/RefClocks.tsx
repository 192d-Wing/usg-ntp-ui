// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Attached reference clocks: GPS, PPS, and the local fallback. */

import { useCallback } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import SpaceBetween from '@cloudscape-design/components/space-between';

import { api } from '../api/client';
import { useNow, useResource } from '../api/hooks';
import type { RefClockStatus } from '../api/types';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import {
  EnabledIndicator,
  FixQualityIndicator,
  InfoLink,
  TableEmptyState,
  ValueWithLabel,
} from '../components/primitives';
import { formatCount, formatRelative, formatSeconds } from '../utils/format';

const POLL_MS = 5000;

const KIND_LABELS: Record<RefClockStatus['kind'], string> = {
  gps: 'GPS receiver',
  pps: 'Pulse per second',
  local: 'Local system clock',
};

export function RefClocks() {
  const openHelp = useOpenHelp();
  usePageHelp(<RefClocksHelp />);

  const fetcher = useCallback(() => api.getRefClocks(), []);
  const clocks = useResource(fetcher, POLL_MS);

  // Drives the "last sample" age, which is the main signal that a driver stalled.
  const now = useNow();

  const items = clocks.data ?? [];
  const activeCount = items.filter((clock) => clock.active).length;
  const hasPrimary = items.some((clock) => clock.active && clock.kind !== 'local');

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Hardware time sources the server disciplines its clock against."
          actions={
            <Button
              iconName="refresh"
              ariaLabel="Refresh reference clocks"
              onClick={clocks.refresh}
            />
          }
        >
          Reference clocks
        </Header>
      }
    >
      <SpaceBetween size="l">
        {clocks.error ? (
          <Alert type="error" header="Could not load reference clocks">
            {clocks.error}
          </Alert>
        ) : null}

        {!clocks.loading && items.length > 0 && !hasPrimary ? (
          <Alert type="warning" header="No primary reference clock is active">
            The server is running on its local system clock. It should not advertise stratum 1
            while in this state - clients would prefer it over better sources on the network.
          </Alert>
        ) : null}

        <Cards
          items={items}
          loading={clocks.loading && !clocks.data}
          loadingText="Loading reference clocks"
          trackBy="id"
          cardDefinition={{
            header: (clock) => (
              <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                <Box variant="h3" padding="n">
                  {clock.id}
                </Box>
                <Badge color={clock.kind === 'local' ? 'grey' : 'blue'}>
                  {KIND_LABELS[clock.kind]}
                </Badge>
              </SpaceBetween>
            ),
            sections: [
              {
                id: 'state',
                content: (clock) => (
                  <ColumnLayout columns={2} variant="text-grid">
                    <ValueWithLabel label="State">
                      <EnabledIndicator
                        enabled={clock.active}
                        enabledLabel="Producing samples"
                        disabledLabel="Idle"
                      />
                    </ValueWithLabel>
                    <ValueWithLabel label="Device">
                      <Box variant="code">{clock.device}</Box>
                    </ValueWithLabel>
                  </ColumnLayout>
                ),
              },
              {
                id: 'measurements',
                header: 'Measurements',
                content: (clock) => (
                  <ColumnLayout columns={2} variant="text-grid">
                    <ValueWithLabel
                      label="Offset"
                      description="Difference between this source and the system clock."
                    >
                      {formatSeconds(clock.offset)}
                    </ValueWithLabel>
                    <ValueWithLabel
                      label="Dispersion"
                      description="Estimated maximum error of this source."
                    >
                      {formatSeconds(clock.dispersion)}
                    </ValueWithLabel>
                    <ValueWithLabel label="Last sample">
                      {formatRelative(clock.last_sample, now)}
                    </ValueWithLabel>
                    {clock.kind === 'gps' ? (
                      <ValueWithLabel label="Fix quality">
                        {clock.fix_quality ? (
                          <FixQualityIndicator quality={clock.fix_quality} />
                        ) : (
                          'Unknown'
                        )}
                      </ValueWithLabel>
                    ) : null}
                    {clock.kind === 'gps' && clock.satellites !== undefined ? (
                      <ValueWithLabel
                        label="Satellites"
                        description="Used in the current fix."
                      >
                        {clock.satellites}
                      </ValueWithLabel>
                    ) : null}
                    {clock.kind === 'pps' && clock.pulse_count !== undefined ? (
                      <ValueWithLabel
                        label="Pulses captured"
                        description="Since the driver started."
                      >
                        {formatCount(clock.pulse_count)}
                      </ValueWithLabel>
                    ) : null}
                  </ColumnLayout>
                ),
              },
            ],
          }}
          cardsPerRow={[{ cards: 1 }, { minWidth: 700, cards: 2 }]}
          header={
            <Header
              counter={`(${activeCount}/${items.length} active)`}
              description="Each card is one configured source. The server combines active sources to discipline its clock."
            >
              Configured sources
            </Header>
          }
          empty={
            <TableEmptyState
              title="No reference clocks"
              subtitle="This build has no reference clock drivers enabled, so the server serves time from the system clock."
            />
          }
          ariaLabels={{
            itemSelectionLabel: (_data, item) => item.id,
            selectionGroupLabel: 'Reference clock selection',
          }}
        />
      </SpaceBetween>
    </ContentLayout>
  );
}

function RefClocksHelp() {
  return (
    <HelpPanel header={<h2>Reference clocks</h2>}>
      <p>
        A reference clock is a local time source the server reads directly rather than over the
        network. With one attached and locked, the server is a stratum 1 primary server.
      </p>
      <h3>GPS and PPS together</h3>
      <p>
        These two sources are complementary and are normally used as a pair. A GPS receiver
        provides the date and time over a serial NMEA sentence, but that message arrives tens of
        milliseconds late and with jitter. A PPS signal is an electrical pulse on the top of each
        second, accurate to well under a microsecond, but it carries no information about{' '}
        <i>which</i> second it is. The server takes the second number from GPS and the precise
        instant from PPS.
      </p>
      <h3>Fix quality</h3>
      <p>
        <b>PPS locked</b> is the state to expect in normal operation. <b>GPS fix</b> alone means
        the receiver has position and time but the pulse is not being used.{' '}
        <b>Estimated</b> means the receiver is dead reckoning without satellites, and its time
        should not be trusted.
      </p>
      <h3>Offset and dispersion</h3>
      <p>
        Offset is how far the system clock currently sits from this source; it should stay small
        and change slowly. Dispersion is the error the server attributes to the source and is what
        it reports to clients as root dispersion. A rising dispersion on a GPS source usually
        means satellites are being lost.
      </p>
      <h3>The local clock</h3>
      <p>
        The local source is a fallback with deliberately high dispersion so that any real
        reference outranks it. If it is the only active source, the server is serving its own
        unsynchronized system clock.
      </p>
    </HelpPanel>
  );
}

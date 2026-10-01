// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** The server event log, as emitted by its `tracing` subscriber. */

import { useCallback, useMemo, useState } from 'react';
import { useCollection } from '@cloudscape-design/collection-hooks';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Multiselect from '@cloudscape-design/components/multiselect';
import Pagination from '@cloudscape-design/components/pagination';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import Toggle from '@cloudscape-design/components/toggle';

import { api } from '../api/client';
import { useResource } from '../api/hooks';
import type { EventLevel } from '../api/types';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import {
  EventLevelIndicator,
  InfoLink,
  TableEmptyState,
  TableNoMatchState,
} from '../components/primitives';
import { formatTimestamp } from '../utils/format';

const POLL_MS = 5000;
const PAGE_SIZE = 25;

const LEVEL_OPTIONS: ReadonlyArray<{ value: EventLevel; label: string }> = [
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
  { value: 'trace', label: 'Trace' },
];

export function Events() {
  const openHelp = useOpenHelp();
  usePageHelp(<EventsHelp />);

  const [live, setLive] = useState(true);
  const [levels, setLevels] = useState<EventLevel[]>([]);

  const fetcher = useCallback(() => api.getEvents(), []);
  const events = useResource(fetcher, live ? POLL_MS : undefined);

  // Level filtering happens before the collection so the count text is accurate.
  const items = useMemo(() => {
    const all = events.data ?? [];
    if (levels.length === 0) {
      return all;
    }
    return all.filter((event) => levels.includes(event.level));
  }, [events.data, levels]);

  const { items: visibleItems, collectionProps, filterProps, filteredItemsCount, paginationProps, actions } =
    useCollection(items, {
      filtering: {
        // `empty` and `noMatch` are supplied on the Table instead of here: the
        // clear-filter action needs `actions`, which is only assigned once this
        // call returns.
        filteringFunction: (event, text) => {
          const needle = text.toLowerCase();
          return (
            event.message.toLowerCase().includes(needle) ||
            event.target.toLowerCase().includes(needle)
          );
        },
      },
      pagination: { pageSize: PAGE_SIZE },
      sorting: {
        defaultState: {
          sortingColumn: { sortingField: 'timestamp' },
          isDescending: true,
        },
      },
    });

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Structured log records from the running server."
        >
          Events
        </Header>
      }
    >
      <Table
        {...collectionProps}
        items={visibleItems}
        loading={events.loading && !events.data}
        loadingText="Loading events"
        trackBy="id"
        variant="full-page"
        stickyHeader
        resizableColumns
        wrapLines
        columnDefinitions={[
          {
            id: 'timestamp',
            header: 'Time',
            cell: (item) => formatTimestamp(item.timestamp),
            sortingField: 'timestamp',
            minWidth: 210,
            isRowHeader: true,
          },
          {
            id: 'level',
            header: 'Level',
            cell: (item) => <EventLevelIndicator level={item.level} />,
            sortingField: 'level',
            minWidth: 120,
          },
          {
            id: 'target',
            header: 'Target',
            cell: (item) => <Box variant="code">{item.target}</Box>,
            sortingField: 'target',
            minWidth: 260,
          },
          {
            id: 'message',
            header: 'Message',
            cell: (item) => item.message,
            minWidth: 340,
          },
        ]}
        empty={
          items.length === 0 ? (
            <TableEmptyState
              title="No events"
              subtitle={
                levels.length > 0
                  ? 'No records match the selected levels.'
                  : 'The server has not emitted any log records yet.'
              }
            />
          ) : (
            <TableNoMatchState onClearFilter={() => actions.setFiltering('')} />
          )
        }
        header={
          <Header
            counter={`(${items.length})`}
            actions={
              <SpaceBetween size="m" direction="horizontal" alignItems="center">
                <Toggle checked={live} onChange={({ detail }) => setLive(detail.checked)}>
                  Live updates
                </Toggle>
                <Button
                  iconName="refresh"
                  ariaLabel="Refresh events"
                  onClick={events.refresh}
                />
              </SpaceBetween>
            }
            description="Newest first. Turn off live updates to hold the view steady while reading."
          >
            Server log
          </Header>
        }
        filter={
          <SpaceBetween size="s" direction="horizontal">
            <TextFilter
              {...filterProps}
              filteringPlaceholder="Find in messages and targets"
              filteringAriaLabel="Filter events"
              countText={`${filteredItemsCount ?? 0} ${
                filteredItemsCount === 1 ? 'match' : 'matches'
              }`}
            />
            <Multiselect
              selectedOptions={LEVEL_OPTIONS.filter((option) => levels.includes(option.value)).map(
                (option) => ({ value: option.value, label: option.label }),
              )}
              options={[...LEVEL_OPTIONS]}
              onChange={({ detail }) =>
                setLevels(detail.selectedOptions.map((option) => option.value as EventLevel))
              }
              placeholder="All levels"
              ariaLabel="Filter by level"
              hideTokens
            />
          </SpaceBetween>
        }
        pagination={
          <Pagination
            {...paginationProps}
            ariaLabels={{
              nextPageLabel: 'Next page',
              previousPageLabel: 'Previous page',
              pageLabel: (pageNumber) => `Page ${pageNumber}`,
            }}
          />
        }
        ariaLabels={{ tableLabel: 'Server log events' }}
      />
    </ContentLayout>
  );
}

function EventsHelp() {
  return (
    <HelpPanel header={<h2>Events</h2>}>
      <p>
        The server emits structured records through the <code>tracing</code> crate. Each record
        carries a level, a target naming the module that produced it, and a message.
      </p>
      <h3>Levels</h3>
      <ul>
        <li>
          <b>Error</b> - something failed and needs attention, such as a TLS handshake error.
        </li>
        <li>
          <b>Warn</b> - a request was refused. Expected in normal operation when rate limits or
          access control are doing their job.
        </li>
        <li>
          <b>Info</b> - normal lifecycle and request activity.
        </li>
        <li>
          <b>Debug</b> and <b>Trace</b> - per-packet detail, usually off in production.
        </li>
      </ul>
      <h3>Which levels you see</h3>
      <p>
        The server filters records before they leave the process, according to its configured
        subscriber level. If debug records are not appearing, the server is not emitting them -
        filtering here cannot recover what was never sent.
      </p>
      <h3>Live updates</h3>
      <p>
        With live updates on, the table re-reads every five seconds and new records appear at the
        top. Turn it off while investigating so rows do not shift under the cursor.
      </p>
    </HelpPanel>
  );
}

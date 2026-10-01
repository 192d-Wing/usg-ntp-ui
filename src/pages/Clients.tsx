// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** The server client table: who is querying, how often, and who is throttled. */

import { useCallback, useMemo, useState } from 'react';
import { useCollection } from '@cloudscape-design/collection-hooks';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Modal from '@cloudscape-design/components/modal';
import Pagination from '@cloudscape-design/components/pagination';
import PropertyFilter from '@cloudscape-design/components/property-filter';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';

import { api } from '../api/client';
import { useMutation, useNow, useResource } from '../api/hooks';
import type { ClientEntry } from '../api/types';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import { useNotifications } from '../components/notification-context';
import { InfoLink, TableEmptyState, TableNoMatchState } from '../components/primitives';
import { formatCount, formatRelative } from '../utils/format';

const POLL_MS = 5000;
const PAGE_SIZE = 20;

export function Clients() {
  const openHelp = useOpenHelp();
  usePageHelp(<ClientsHelp />);
  const { notify } = useNotifications();

  const fetcher = useCallback(() => api.getClients(), []);
  const clients = useResource(fetcher, POLL_MS);

  const [selected, setSelected] = useState<ClientEntry[]>([]);
  const [confirmEvict, setConfirmEvict] = useState(false);

  // Drives the "last seen" column so the ages count up between polls.
  const now = useNow();

  const evict = useMutation(
    useCallback(async (addresses: string[]) => {
      await Promise.all(addresses.map((address) => api.evictClient(address)));
      return addresses;
    }, []),
  );

  const items = useMemo(() => clients.data ?? [], [clients.data]);

  const { items: visibleItems, collectionProps, propertyFilterProps, paginationProps, actions } =
    useCollection(items, {
      propertyFiltering: {
        filteringProperties: [
          {
            key: 'address',
            propertyLabel: 'Address',
            groupValuesLabel: 'Addresses',
            operators: [':', '!:', '=', '!='],
          },
          {
            key: 'ntp_version',
            propertyLabel: 'NTP version',
            groupValuesLabel: 'NTP versions',
            operators: ['=', '!=', '>=', '<='],
          },
          {
            key: 'rate_limited',
            propertyLabel: 'Rate limited',
            groupValuesLabel: 'Rate limited states',
            operators: ['='],
          },
          {
            key: 'nts',
            propertyLabel: 'NTS authenticated',
            groupValuesLabel: 'NTS states',
            operators: ['='],
          },
          {
            key: 'total_requests',
            propertyLabel: 'Total requests',
            groupValuesLabel: 'Request counts',
            operators: ['>=', '<=', '>', '<', '='],
          },
          {
            key: 'kod_sent',
            propertyLabel: 'KoD sent',
            groupValuesLabel: 'KoD counts',
            operators: ['>=', '<=', '>', '<', '='],
          },
        ],
        // `empty` and `noMatch` are supplied on the Table instead of here: the
        // clear-filter action needs `actions`, which is only assigned once this
        // call returns.
      },
      pagination: { pageSize: PAGE_SIZE },
      sorting: {
        defaultState: {
          sortingColumn: { sortingField: 'total_requests' },
          isDescending: true,
        },
      },
      selection: {},
    });

  const handleEvict = async () => {
    const addresses = selected.map((client) => client.address);
    const result = await evict.run(addresses);
    setConfirmEvict(false);
    if (result) {
      notify(
        'success',
        `Removed ${addresses.length} ${addresses.length === 1 ? 'entry' : 'entries'} from the client table.`,
      );
      setSelected([]);
      clients.refresh();
    } else if (evict.error) {
      notify('error', evict.error, 'Could not evict clients');
    }
  };

  const rateLimitedCount = items.filter((client) => client.rate_limited).length;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Clients the server is currently tracking for rate limiting purposes."
        >
          Clients
        </Header>
      }
    >
      <Table
        {...collectionProps}
        items={visibleItems}
        loading={clients.loading && !clients.data}
        loadingText="Loading client table"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy="address"
        variant="full-page"
        stickyHeader
        resizableColumns
        wrapLines={false}
        columnDefinitions={[
          {
            id: 'address',
            header: 'Address',
            cell: (item) => <Box variant="code">{item.address}</Box>,
            sortingField: 'address',
            isRowHeader: true,
            minWidth: 160,
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) =>
              item.rate_limited ? (
                <StatusIndicator type="warning">Rate limited</StatusIndicator>
              ) : (
                <StatusIndicator type="success">Accepted</StatusIndicator>
              ),
            sortingField: 'rate_limited',
            minWidth: 120,
          },
          {
            id: 'ntp_version',
            header: 'Version',
            cell: (item) => `NTPv${item.ntp_version}`,
            sortingField: 'ntp_version',
            minWidth: 90,
          },
          {
            id: 'nts',
            header: 'NTS',
            cell: (item) =>
              item.nts ? <Badge color="green">Authenticated</Badge> : <Badge>Plain</Badge>,
            sortingField: 'nts',
            minWidth: 120,
          },
          {
            id: 'requests_in_window',
            header: 'In window',
            cell: (item) => formatCount(item.requests_in_window),
            sortingField: 'requests_in_window',
            minWidth: 100,
          },
          {
            id: 'total_requests',
            header: 'Total requests',
            cell: (item) => formatCount(item.total_requests),
            sortingField: 'total_requests',
            minWidth: 120,
          },
          {
            id: 'kod_sent',
            header: 'KoD sent',
            cell: (item) => formatCount(item.kod_sent),
            sortingField: 'kod_sent',
            minWidth: 100,
          },
          {
            id: 'last_seen',
            header: 'Last seen',
            cell: (item) => formatRelative(item.last_seen, now),
            sortingField: 'last_seen',
            minWidth: 110,
          },
        ]}
        empty={
          items.length === 0 ? (
            <TableEmptyState
              title="No clients"
              subtitle="The server has not tracked any client requests yet."
            />
          ) : (
            <TableNoMatchState
              onClearFilter={() =>
                actions.setPropertyFiltering({ tokens: [], operation: 'and' })
              }
            />
          )
        }
        header={
          <Header
            counter={
              selected.length > 0 ? `(${selected.length}/${items.length})` : `(${items.length})`
            }
            description={
              rateLimitedCount > 0
                ? `${rateLimitedCount} ${rateLimitedCount === 1 ? 'client is' : 'clients are'} currently being rate limited.`
                : 'No clients are currently being rate limited.'
            }
            actions={
              <SpaceBetween size="xs" direction="horizontal">
                <Button iconName="refresh" onClick={clients.refresh} ariaLabel="Refresh" />
                <Button
                  disabled={selected.length === 0}
                  onClick={() => setConfirmEvict(true)}
                >
                  Evict
                </Button>
              </SpaceBetween>
            }
          >
            Tracked clients
          </Header>
        }
        filter={
          <PropertyFilter
            {...propertyFilterProps}
            filteringPlaceholder="Filter clients by address, version, or state"
            countText={`${visibleItems.length} ${visibleItems.length === 1 ? 'match' : 'matches'}`}
            i18nStrings={{
              filteringAriaLabel: 'Filter clients',
              dismissAriaLabel: 'Dismiss',
              filteringPlaceholder: 'Filter clients',
              groupValuesText: 'Values',
              groupPropertiesText: 'Properties',
              operatorsText: 'Operators',
              operationAndText: 'and',
              operationOrText: 'or',
              operatorLessText: 'Less than',
              operatorLessOrEqualText: 'Less than or equal',
              operatorGreaterText: 'Greater than',
              operatorGreaterOrEqualText: 'Greater than or equal',
              operatorContainsText: 'Contains',
              operatorDoesNotContainText: 'Does not contain',
              operatorEqualsText: 'Equals',
              operatorDoesNotEqualText: 'Does not equal',
              editTokenHeader: 'Edit filter',
              propertyText: 'Property',
              operatorText: 'Operator',
              valueText: 'Value',
              cancelActionText: 'Cancel',
              applyActionText: 'Apply',
              allPropertiesLabel: 'All properties',
              tokenLimitShowMore: 'Show more',
              tokenLimitShowFewer: 'Show fewer',
              clearFiltersText: 'Clear filters',
              removeTokenButtonAriaLabel: () => 'Remove filter',
              enteredTextLabel: (text) => `Use: "${text}"`,
            }}
          />
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
        ariaLabels={{
          selectionGroupLabel: 'Client selection',
          allItemsSelectionLabel: () => 'Select all clients',
          itemSelectionLabel: (_data, item) => `Select ${item.address}`,
          tableLabel: 'Tracked clients',
        }}
      />

      <Modal
        visible={confirmEvict}
        onDismiss={() => setConfirmEvict(false)}
        header="Evict clients from the table"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setConfirmEvict(false)}>
                Cancel
              </Button>
              <Button variant="primary" loading={evict.pending} onClick={() => void handleEvict()}>
                Evict
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            Removing {selected.length} {selected.length === 1 ? 'entry' : 'entries'} clears the
            stored request history for{' '}
            {selected.length === 1 ? 'this client' : 'these clients'}.
          </Box>
          <Box color="text-status-warning">
            Any client currently being rate limited will be able to query again immediately. The
            entry is recreated on the next request.
          </Box>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}

function ClientsHelp() {
  return (
    <HelpPanel header={<h2>Clients</h2>}>
      <p>
        The server keeps one entry per client address so it can enforce per-client rate limits.
        The table is capped by the <b>max clients</b> setting on the rate limiting page; once the
        cap is reached the oldest entries are reclaimed.
      </p>
      <h3>Columns</h3>
      <ul>
        <li>
          <b>In window</b> - requests counted in the current rate limit window. When this exceeds
          the configured maximum the client receives a KoD RATE response.
        </li>
        <li>
          <b>Total requests</b> - every request from this address since the entry was created.
        </li>
        <li>
          <b>KoD sent</b> - Kiss-o-Death responses sent to this client.
        </li>
        <li>
          <b>NTS</b> - whether the client authenticates with Network Time Security (RFC 8915).
        </li>
      </ul>
      <h3>Evicting a client</h3>
      <p>
        Eviction clears the entry, which resets the rate limit counter. It is not a block - use
        the deny list on the access control page to refuse a client outright.
      </p>
    </HelpPanel>
  );
}

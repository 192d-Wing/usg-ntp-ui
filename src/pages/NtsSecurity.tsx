// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Network Time Security state: the NTS-KE listener, its certificate, and cookie keys. */

import { useCallback, useState } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import CopyToClipboard from '@cloudscape-design/components/copy-to-clipboard';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';

import { api } from '../api/client';
import { useMutation, useNow, useResource } from '../api/hooks';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import { useNotifications } from '../components/notification-context';
import {
  EnabledIndicator,
  InfoLink,
  StatTile,
  ValueWithLabel,
} from '../components/primitives';
import {
  formatCount,
  formatPercent,
  formatRelative,
  formatTimestamp,
} from '../utils/format';

const POLL_MS = 15_000;

/** Warn this many days before the certificate expires. */
const CERT_WARNING_DAYS = 30;

export function NtsSecurity() {
  const openHelp = useOpenHelp();
  usePageHelp(<NtsHelp />);
  const { notify } = useNotifications();

  const fetcher = useCallback(() => api.getNtsStatus(), []);
  const nts = useResource(fetcher, POLL_MS);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const rotate = useMutation(useCallback(() => api.rotateNtsKeys(), []));

  // Held in state rather than read during render, so the certificate countdown
  // and the rotation age do not depend on when React happened to re-render.
  // Declared before the early returns below, since hooks cannot be conditional.
  const now = useNow();

  const handleRotate = async () => {
    const result = await rotate.run();
    setConfirmRotate(false);
    if (result) {
      nts.setData(result);
      notify(
        'success',
        'Cookie keys rotated. Existing cookies remain valid until they are next used.',
      );
    } else if (rotate.error) {
      notify('error', rotate.error, 'Could not rotate cookie keys');
    }
  };

  if (nts.loading && !nts.data) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  if (!nts.data) {
    return (
      <ContentLayout header={<Header variant="h1">NTS security</Header>}>
        <Alert type="error" header="Could not load NTS status">
          {nts.error ?? 'The server did not return NTS status.'}
        </Alert>
      </ContentLayout>
    );
  }

  const status = nts.data;
  const daysToExpiry = Math.floor((status.cert_expires - now) / 86_400_000);
  const totalHandshakes = status.handshakes_completed + status.handshakes_failed;

  let certStatus: 'error' | 'warning' | 'success' = 'success';
  if (daysToExpiry <= 0) {
    certStatus = 'error';
  } else if (daysToExpiry <= CERT_WARNING_DAYS) {
    certStatus = 'warning';
  }

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Authenticated time via Network Time Security (RFC 8915)."
          actions={<EnabledIndicator enabled={status.enabled} />}
        >
          NTS security
        </Header>
      }
    >
      <SpaceBetween size="l">
        {!status.enabled ? (
          <Alert type="info" header="NTS is not enabled">
            This server answers plain NTP only. Clients cannot verify that a response came from
            this server or that it was not modified in transit. Enabling NTS requires the{' '}
            <Box variant="code">nts</Box> Cargo feature and a TLS certificate.
          </Alert>
        ) : null}

        {status.enabled && daysToExpiry <= CERT_WARNING_DAYS ? (
          <Alert
            type={daysToExpiry <= 0 ? 'error' : 'warning'}
            header={
              daysToExpiry <= 0
                ? 'The NTS-KE certificate has expired'
                : `The NTS-KE certificate expires in ${daysToExpiry} days`
            }
          >
            {daysToExpiry <= 0
              ? 'Clients can no longer complete a key exchange. Install a current certificate and restart the NTS-KE listener.'
              : 'Renew the certificate before it expires, otherwise clients will be unable to establish new NTS sessions.'}
          </Alert>
        ) : null}

        <Container header={<Header variant="h2">Key exchange</Header>}>
          <ColumnLayout columns={3} variant="text-grid" minColumnWidth={200}>
            <StatTile
              label="Handshakes completed"
              value={formatCount(status.handshakes_completed)}
              secondary={
                totalHandshakes > 0
                  ? `${formatPercent(status.handshakes_completed, totalHandshakes)} success rate`
                  : 'No handshakes yet'
              }
            />
            <StatTile
              label="Handshakes failed"
              value={formatCount(status.handshakes_failed)}
              secondary="TLS or protocol negotiation errors"
              status={
                status.handshakes_failed > 0 ? (
                  <StatusIndicator type="warning">Some failures</StatusIndicator>
                ) : (
                  <StatusIndicator type="success">No failures</StatusIndicator>
                )
              }
            />
            <StatTile
              label="Cookie keys rotated"
              value={formatRelative(status.last_key_rotation, now)}
              secondary={formatTimestamp(status.last_key_rotation)}
            />
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="The TLS endpoint clients contact to obtain cookies."
            >
              NTS-KE listener
            </Header>
          }
        >
          <ColumnLayout columns={2} variant="text-grid">
            <ValueWithLabel label="Listen address">
              <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                <Box variant="code">{status.ke_address}</Box>
                <CopyToClipboard
                  copyButtonAriaLabel="Copy listen address"
                  copyErrorText="Could not copy"
                  copySuccessText="Address copied"
                  textToCopy={status.ke_address}
                  variant="icon"
                />
              </SpaceBetween>
            </ValueWithLabel>

            <ValueWithLabel
              label="ALPN protocol"
              description="Negotiated during the TLS handshake."
            >
              <Box variant="code">{status.alpn}</Box>
            </ValueWithLabel>

            <ValueWithLabel label="Certificate subject">
              <Box variant="code">{status.cert_subject}</Box>
            </ValueWithLabel>

            <ValueWithLabel
              label="Certificate expires"
              description={formatTimestamp(status.cert_expires)}
            >
              <StatusIndicator type={certStatus}>
                {daysToExpiry <= 0 ? 'Expired' : `In ${daysToExpiry} days`}
              </StatusIndicator>
            </ValueWithLabel>
          </ColumnLayout>
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description="Algorithms used to authenticate time exchanges."
            >
              Cryptography
            </Header>
          }
        >
          <SpaceBetween size="l">
            <ColumnLayout columns={2} variant="text-grid">
              <ValueWithLabel
                label="AEAD algorithm"
                description="Protects the cookie and authenticates each NTP exchange."
              >
                <Box variant="code">{status.aead_algorithm}</Box>
              </ValueWithLabel>

              <ValueWithLabel
                label="Post-quantum key exchange"
                description="X25519MLKEM768 hybrid, offered during the TLS handshake."
              >
                {status.post_quantum ? (
                  <SpaceBetween size="xs" direction="horizontal" alignItems="center">
                    <StatusIndicator type="success">Offered</StatusIndicator>
                    <Badge color="green">ML-KEM</Badge>
                  </SpaceBetween>
                ) : (
                  <StatusIndicator type="info">Not offered</StatusIndicator>
                )}
              </ValueWithLabel>
            </ColumnLayout>

            <Box>
              <Button
                disabled={!status.enabled}
                onClick={() => setConfirmRotate(true)}
                iconName="refresh"
              >
                Rotate cookie keys
              </Button>
            </Box>
          </SpaceBetween>
        </Container>
      </SpaceBetween>

      <Modal
        visible={confirmRotate}
        onDismiss={() => setConfirmRotate(false)}
        header="Rotate cookie keys"
        footer={
          <Box float="right">
            <SpaceBetween size="xs" direction="horizontal">
              <Button variant="link" onClick={() => setConfirmRotate(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={rotate.pending}
                onClick={() => void handleRotate()}
              >
                Rotate
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            A new master key is generated for issuing NTS cookies. The previous key is retained
            so cookies already held by clients keep working; each client receives a fresh cookie
            on its next exchange.
          </Box>
          <Box color="text-status-warning">
            Rotating twice in quick succession drops the oldest key and will force clients holding
            cookies from it back through the NTS-KE handshake.
          </Box>
        </SpaceBetween>
      </Modal>
    </ContentLayout>
  );
}

function NtsHelp() {
  return (
    <HelpPanel header={<h2>NTS security</h2>}>
      <p>
        Network Time Security gives NTP cryptographic authentication: a client can verify that a
        response came from this server and was not altered. It does not encrypt the time itself -
        timestamps are not secret - it authenticates them.
      </p>
      <h3>How an exchange works</h3>
      <p>
        A client first connects to the NTS-KE listener over TLS, authenticates the server by its
        certificate, and receives a set of cookies plus the keys to use with them. Afterwards it
        queries the normal NTP port, spending one cookie per request and receiving a fresh one in
        each response. The server itself keeps no per-client session state.
      </p>
      <h3>Cookie keys</h3>
      <p>
        Cookies are encrypted blobs the server issues to itself - they hold the session keys so
        the server does not have to remember them. Rotating the master key limits how long a
        leaked key would be useful. The previous key is kept so rotation does not interrupt
        clients.
      </p>
      <h3>Post-quantum key exchange</h3>
      <p>
        With the <code>pq-nts</code> feature the TLS handshake offers the X25519MLKEM768 hybrid
        group, so the key exchange resists an adversary who records traffic now and attacks it
        later with a quantum computer. Clients that do not support it negotiate X25519 as usual.
      </p>
      <h3>Certificate expiry</h3>
      <p>
        An expired certificate does not stop the server answering plain NTP, and clients holding
        valid cookies keep working. What breaks is new key exchanges, so the failure appears
        gradually as cookies run out.
      </p>
    </HelpPanel>
  );
}

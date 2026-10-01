// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Allow and deny lists, applied to the running server without a restart. */

import { useCallback, useState } from 'react';
import Alert from '@cloudscape-design/components/alert';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Toggle from '@cloudscape-design/components/toggle';

import { api } from '../api/client';
import { useMutation, useResource } from '../api/hooks';
import type { AccessControlConfig } from '../api/types';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import { useNotifications } from '../components/notification-context';
import { InfoLink } from '../components/primitives';
import { formatCidr } from '../utils/format';
import { parseCidr } from '../utils/validation';

/** One editable row. Kept as raw text so the operator can type freely. */
interface CidrRow {
  /** Stable key so React does not reorder inputs while typing. */
  key: string;
  value: string;
}

let rowCounter = 0;
function makeRow(value = ''): CidrRow {
  rowCounter += 1;
  return { key: `row-${rowCounter}`, value };
}

function toRows(nets: AccessControlConfig['allow_list']): CidrRow[] {
  return (nets ?? []).map((net) => makeRow(formatCidr(net)));
}

export function AccessControl() {
  const openHelp = useOpenHelp();
  usePageHelp(<AccessControlHelp />);

  const fetcher = useCallback(() => api.getAccessControl(), []);
  const config = useResource(fetcher);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Restrict which networks may query the time service. Changes apply immediately, without a restart."
        >
          Access control
        </Header>
      }
    >
      {config.data ? (
        // Keying on the resource version remounts the form whenever new config
        // loads, which re-seeds the rows from the server without copying props
        // into state from an effect.
        <AccessControlForm
          key={config.version}
          initial={config.data}
          onSaved={config.setData}
        />
      ) : (
        <Box textAlign="center" padding="xxl">
          {config.error ? (
            <Alert type="error" header="Could not load access control lists">
              {config.error}
            </Alert>
          ) : (
            <Spinner size="large" />
          )}
        </Box>
      )}
    </ContentLayout>
  );
}

function AccessControlForm({
  initial,
  onSaved,
}: {
  initial: AccessControlConfig;
  onSaved: (next: AccessControlConfig) => void;
}) {
  const { notify } = useNotifications();

  const [allowEnabled, setAllowEnabled] = useState(() => initial.allow_list !== null);
  const [allowRows, setAllowRows] = useState<CidrRow[]>(() => toRows(initial.allow_list));
  const [denyRows, setDenyRows] = useState<CidrRow[]>(() => toRows(initial.deny_list));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const save = useMutation(
    useCallback((next: AccessControlConfig) => api.updateAccessControl(next), []),
  );

  const updateRow = (
    rows: CidrRow[],
    setRows: (rows: CidrRow[]) => void,
    index: number,
    value: string,
  ) => {
    const next = [...rows];
    next[index] = { ...next[index], value };
    setRows(next);
    setDirty(true);
    // Clear the error for this row as soon as the operator edits it.
    setErrors((current) => {
      const { [next[index].key]: _removed, ...rest } = current;
      return rest;
    });
  };

  /** Validate every row, collecting per-row errors keyed by row id. */
  const validateAll = (): AccessControlConfig | undefined => {
    const nextErrors: Record<string, string> = {};
    const allowNets: AccessControlConfig['allow_list'] = [];
    const denyNets: AccessControlConfig['deny_list'] = [];

    if (allowEnabled) {
      for (const row of allowRows) {
        const result = parseCidr(row.value);
        if (result.ok) {
          allowNets.push(result.value);
        } else {
          nextErrors[row.key] = result.error;
        }
      }
    }

    for (const row of denyRows) {
      const result = parseCidr(row.value);
      if (result.ok) {
        denyNets.push(result.value);
      } else {
        nextErrors[row.key] = result.error;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return undefined;
    }

    return {
      allow_list: allowEnabled ? allowNets : null,
      deny_list: denyNets.length > 0 ? denyNets : null,
    };
  };

  const handleSubmit = async () => {
    const validated = validateAll();
    if (!validated) {
      notify('error', 'Fix the highlighted entries before saving.', 'Invalid access control list');
      return;
    }

    const result = await save.run(validated);
    if (result) {
      setDirty(false);
      notify('success', 'Access control lists applied to the running server.');
      // Publishing last: this remounts the form with the server's own response.
      onSaved(result);
    } else if (save.error) {
      notify('error', save.error, 'Could not apply access control');
    }
  };

  const handleReset = () => {
    setAllowEnabled(initial.allow_list !== null);
    setAllowRows(toRows(initial.allow_list));
    setDenyRows(toRows(initial.deny_list));
    setErrors({});
    setDirty(false);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <Form
        actions={
          <SpaceBetween size="xs" direction="horizontal">
            <Button variant="link" disabled={!dirty} onClick={handleReset} formAction="none">
              Reset
            </Button>
            <Button variant="primary" loading={save.pending} disabled={!dirty}>
              Apply changes
            </Button>
          </SpaceBetween>
        }
      >
          <SpaceBetween size="l">
            <Alert type="warning" header="An empty allow list refuses every client">
              When the allow list is enabled it is authoritative: any address that does not match
              an entry receives a Kiss-o-Death RSTR response. Enabling it with no entries makes
              the server unreachable.
            </Alert>

            <Container
              header={
                <Header
                  variant="h2"
                  description="When enabled, only these networks may query the server."
                >
                  Allow list
                </Header>
              }
            >
              <SpaceBetween size="l">
                <Toggle
                  checked={allowEnabled}
                  onChange={({ detail }) => {
                    setAllowEnabled(detail.checked);
                    setDirty(true);
                    if (detail.checked && allowRows.length === 0) {
                      setAllowRows([makeRow()]);
                    }
                  }}
                  description="Leave this off to accept queries from any address that is not denied."
                >
                  Enforce an allow list
                </Toggle>

                {allowEnabled ? (
                  <AttributeEditor
                    onAddButtonClick={() => {
                      setAllowRows([...allowRows, makeRow()]);
                      setDirty(true);
                    }}
                    onRemoveButtonClick={({ detail }) => {
                      setAllowRows(allowRows.filter((_, index) => index !== detail.itemIndex));
                      setDirty(true);
                    }}
                    items={allowRows}
                    addButtonText="Add network"
                    removeButtonText="Remove"
                    empty="No networks added. The server will refuse every client until you add one."
                    definition={[
                      {
                        label: 'Network (CIDR)',
                        control: (item: CidrRow, index) => (
                          <Input
                            value={item.value}
                            placeholder="10.0.0.0/8"
                            inputMode="text"
                            onChange={({ detail }) =>
                              updateRow(allowRows, setAllowRows, index, detail.value)
                            }
                            ariaLabel={`Allowed network ${index + 1}`}
                          />
                        ),
                        errorText: (item: CidrRow) => errors[item.key],
                      },
                    ]}
                  />
                ) : null}
              </SpaceBetween>
            </Container>

            <Container
              header={
                <Header
                  variant="h2"
                  description="These networks are always refused, even if they match the allow list."
                >
                  Deny list
                </Header>
              }
            >
              <AttributeEditor
                onAddButtonClick={() => {
                  setDenyRows([...denyRows, makeRow()]);
                  setDirty(true);
                }}
                onRemoveButtonClick={({ detail }) => {
                  setDenyRows(denyRows.filter((_, index) => index !== detail.itemIndex));
                  setDirty(true);
                }}
                items={denyRows}
                addButtonText="Add network"
                removeButtonText="Remove"
                empty="No networks denied."
                definition={[
                  {
                    label: 'Network (CIDR)',
                    control: (item: CidrRow, index) => (
                      <Input
                        value={item.value}
                        placeholder="203.0.113.0/24"
                        inputMode="text"
                        onChange={({ detail }) =>
                          updateRow(denyRows, setDenyRows, index, detail.value)
                        }
                        ariaLabel={`Denied network ${index + 1}`}
                      />
                    ),
                    errorText: (item: CidrRow) => errors[item.key],
                  },
                ]}
              />
            </Container>

            <Container header={<Header variant="h2">Evaluation order</Header>}>
              <FormField
                label="How a request is matched"
                description="The server checks each incoming packet in this order."
              >
                <Box variant="p">
                  1. If the source address matches the deny list, respond with KoD DENY.
                  <br />
                  2. Otherwise, if an allow list is enforced and the address does not match it,
                  respond with KoD RSTR.
                  <br />
                  3. Otherwise, apply the rate limit and answer normally.
                </Box>
              </FormField>
            </Container>
          </SpaceBetween>
      </Form>
    </form>
  );
}

function AccessControlHelp() {
  return (
    <HelpPanel header={<h2>Access control</h2>}>
      <p>
        Access control is evaluated per packet against the source IP address, before rate
        limiting. Both lists accept IPv4 and IPv6 networks in CIDR notation.
      </p>
      <h3>Notation</h3>
      <p>
        Enter a network as <b>address/prefix</b>, for example <code>10.0.0.0/8</code> or{' '}
        <code>2001:db8::/32</code>. A bare address is treated as a single host, so{' '}
        <code>192.0.2.5</code> becomes <code>192.0.2.5/32</code>.
      </p>
      <h3>IPv4-mapped IPv6 addresses</h3>
      <p>
        When the server listens on a dual-stack socket, IPv4 clients arrive as IPv4-mapped IPv6
        addresses. The server normalizes these before matching, so an IPv4 rule such as{' '}
        <code>10.0.0.0/8</code> applies to those clients as written - you do not need a separate{' '}
        <code>::ffff:10.0.0.0/104</code> entry.
      </p>
      <h3>Kiss-o-Death responses</h3>
      <p>
        A refused client receives a stratum 0 response carrying a KoD code rather than silence,
        which tells a well-behaved client to stop querying. Refusals are counted on the metrics
        page.
      </p>
    </HelpPanel>
  );
}

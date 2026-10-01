// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Protocol and socket settings that the server reports in every response. */

import { useCallback, useState } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import HelpPanel from '@cloudscape-design/components/help-panel';
import Input from '@cloudscape-design/components/input';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Toggle from '@cloudscape-design/components/toggle';

import { api } from '../api/client';
import { useMutation, useResource } from '../api/hooks';
import type { LeapIndicator, ServerSettings as Settings, Timescale } from '../api/types';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import { useNotifications } from '../components/notification-context';
import { InfoLink } from '../components/primitives';
import { formatSeconds } from '../utils/format';
import {
  validateIntInRange,
  validateListenAddress,
  validateNonNegativeFloat,
  validateReferenceId,
  validateV5ReferenceId,
} from '../utils/validation';

const LEAP_OPTIONS: ReadonlyArray<{ value: LeapIndicator; label: string }> = [
  { value: 'no_warning', label: 'No warning' },
  { value: 'add_one', label: 'Add one second (positive leap)' },
  { value: 'sub_one', label: 'Subtract one second (negative leap)' },
  { value: 'unknown', label: 'Unknown (clock not synchronized)' },
];

const TIMESCALE_OPTIONS: ReadonlyArray<{ value: Timescale; label: string }> = [
  { value: 'utc', label: 'UTC' },
  { value: 'tai', label: 'TAI' },
  { value: 'ut1', label: 'UT1' },
  { value: 'leap_smeared_utc', label: 'Leap-smeared UTC' },
];

/** Text-backed mirror of `ServerSettings` so partial input is preserved. */
interface FormState {
  listen: string;
  stratum: string;
  referenceId: string;
  precision: string;
  leapIndicator: LeapIndicator;
  rootDelay: string;
  rootDispersion: string;
  enableInterleaved: boolean;
  v6only: boolean;
  dscp: string;
  timescale: Timescale;
  v5ReferenceId: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toFormState(settings: Settings): FormState {
  return {
    listen: settings.listen,
    stratum: String(settings.stratum),
    referenceId: settings.reference_id,
    precision: String(settings.precision),
    leapIndicator: settings.leap_indicator,
    rootDelay: String(settings.root_delay),
    rootDispersion: String(settings.root_dispersion),
    enableInterleaved: settings.enable_interleaved,
    v6only: settings.v6only,
    dscp: String(settings.dscp),
    timescale: settings.timescale,
    v5ReferenceId: settings.v5_reference_id,
  };
}

export function ServerSettings() {
  const openHelp = useOpenHelp();
  usePageHelp(<ServerSettingsHelp />);

  const fetcher = useCallback(() => api.getServerSettings(), []);
  const settings = useResource(fetcher);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Protocol identity, socket options, and NTPv5 settings for the time service."
        >
          Server settings
        </Header>
      }
    >
      {settings.data ? (
        // Keying on the resource version remounts the form whenever new settings
        // load, which re-seeds the fields from the server without copying props
        // into state from an effect.
        <ServerSettingsForm
          key={settings.version}
          initial={settings.data}
          onSaved={settings.setData}
        />
      ) : (
        <Box textAlign="center" padding="xxl">
          {settings.error ? (
            <Alert type="error" header="Could not load server settings">
              {settings.error}
            </Alert>
          ) : (
            <Spinner size="large" />
          )}
        </Box>
      )}
    </ContentLayout>
  );
}

function ServerSettingsForm({
  initial,
  onSaved,
}: {
  initial: Settings;
  onSaved: (next: Settings) => void;
}) {
  const { notify } = useNotifications();

  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);

  const save = useMutation(
    useCallback((next: Settings) => api.updateServerSettings(next), []),
  );

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setDirty(true);
  };

  const handleSubmit = async () => {
    const listen = validateListenAddress(form.listen);
    const stratum = validateIntInRange(form.stratum, 0, 16, 'Stratum');
    const referenceId = validateReferenceId(form.referenceId);
    const precision = validateIntInRange(form.precision, -32, 0, 'Precision');
    const rootDelay = validateNonNegativeFloat(form.rootDelay, 'Root delay');
    const rootDispersion = validateNonNegativeFloat(form.rootDispersion, 'Root dispersion');
    const dscp = validateIntInRange(form.dscp, 0, 63, 'DSCP');
    const v5ReferenceId = validateV5ReferenceId(form.v5ReferenceId);

    const nextErrors: FieldErrors = {};
    if (!listen.ok) nextErrors.listen = listen.error;
    if (!stratum.ok) nextErrors.stratum = stratum.error;
    if (!referenceId.ok) nextErrors.referenceId = referenceId.error;
    if (!precision.ok) nextErrors.precision = precision.error;
    if (!rootDelay.ok) nextErrors.rootDelay = rootDelay.error;
    if (!rootDispersion.ok) nextErrors.rootDispersion = rootDispersion.error;
    if (!dscp.ok) nextErrors.dscp = dscp.error;
    if (!v5ReferenceId.ok) nextErrors.v5ReferenceId = v5ReferenceId.error;

    setErrors(nextErrors);

    if (
      !listen.ok ||
      !stratum.ok ||
      !referenceId.ok ||
      !precision.ok ||
      !rootDelay.ok ||
      !rootDispersion.ok ||
      !dscp.ok ||
      !v5ReferenceId.ok
    ) {
      notify('error', 'Fix the highlighted fields before saving.', 'Invalid server settings');
      return;
    }

    const result = await save.run({
      listen: listen.value,
      stratum: stratum.value,
      reference_id: referenceId.value,
      precision: precision.value,
      leap_indicator: form.leapIndicator,
      root_delay: rootDelay.value,
      root_dispersion: rootDispersion.value,
      enable_interleaved: form.enableInterleaved,
      v6only: form.v6only,
      dscp: dscp.value,
      timescale: form.timescale,
      v5_reference_id: v5ReferenceId.value,
    });

    if (result) {
      setDirty(false);
      notify('success', 'Server settings saved.');
      // Publishing last: this remounts the form with the server's own response.
      onSaved(result);
    } else if (save.error) {
      notify('error', save.error, 'Could not save server settings');
    }
  };

  // These two are properties of the bound socket, so a change to either cannot
  // take effect until the server rebinds.
  const needsRestart = form.listen !== initial.listen || form.v6only !== initial.v6only;

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
            <Button
              variant="link"
              formAction="none"
              disabled={!dirty}
              onClick={() => {
                setForm(toFormState(initial));
                setErrors({});
                setDirty(false);
              }}
            >
              Reset
            </Button>
            <Button variant="primary" loading={save.pending} disabled={!dirty}>
              Save changes
            </Button>
          </SpaceBetween>
        }
      >
          <SpaceBetween size="l">
            {needsRestart ? (
              <Alert type="warning" header="This change requires a restart">
                The listen address and IPv6-only flag are applied when the socket is bound. The
                server keeps serving on its current socket until it is restarted.
              </Alert>
            ) : null}

            <Container
              header={
                <Header variant="h2" description="Where the server accepts NTP queries.">
                  Network
                </Header>
              }
            >
              <ColumnLayout columns={2}>
                <FormField
                  label="Listen address"
                  description="Socket address to bind, including the port."
                  errorText={errors.listen}
                  constraintText="For example [::]:123 for dual-stack, or 0.0.0.0:123 for IPv4 only."
                >
                  <Input
                    value={form.listen}
                    onChange={({ detail }) => setField('listen', detail.value)}
                  />
                </FormField>

                <FormField
                  label="DSCP marking"
                  description="Differentiated services value for outgoing packets."
                  errorText={errors.dscp}
                  constraintText="0 to 63. 46 is Expedited Forwarding, the usual choice for time traffic."
                >
                  <Input
                    value={form.dscp}
                    type="number"
                    inputMode="numeric"
                    onChange={({ detail }) => setField('dscp', detail.value)}
                  />
                </FormField>

                <Toggle
                  checked={form.v6only}
                  onChange={({ detail }) => setField('v6only', detail.checked)}
                  description="When off, an IPv6 socket also accepts IPv4 clients as IPv4-mapped addresses."
                >
                  IPv6 only
                </Toggle>

                <Toggle
                  checked={form.enableInterleaved}
                  onChange={({ detail }) => setField('enableInterleaved', detail.checked)}
                  description="RFC 9769. Improves accuracy by reporting a hardware-grade transmit timestamp from the previous exchange."
                >
                  Interleaved mode
                </Toggle>
              </ColumnLayout>
            </Container>

            <Container
              header={
                <Header
                  variant="h2"
                  description="Values the server reports in the header of every response."
                >
                  Clock identity
                </Header>
              }
            >
              <ColumnLayout columns={2}>
                <FormField
                  label="Stratum"
                  description="Distance from a primary reference clock."
                  errorText={errors.stratum}
                  constraintText="1 for a server attached to a reference clock; 16 means unsynchronized."
                >
                  <Input
                    value={form.stratum}
                    type="number"
                    inputMode="numeric"
                    onChange={({ detail }) => setField('stratum', detail.value)}
                  />
                </FormField>

                <FormField
                  label="Reference ID"
                  description="Identifies the time source."
                  errorText={errors.referenceId}
                  constraintText="Up to 4 ASCII characters, for example GPS, PPS, or DCFa."
                >
                  <Input
                    value={form.referenceId}
                    onChange={({ detail }) => setField('referenceId', detail.value)}
                  />
                </FormField>

                <FormField
                  label="Precision"
                  description="Clock resolution as a signed power of two, in seconds."
                  errorText={errors.precision}
                  constraintText={`-32 to 0. ${
                    /^-?\d+$/.test(form.precision.trim())
                      ? `2^${form.precision} s is ${formatSeconds(2 ** Number(form.precision))}.`
                      : 'Enter a whole number.'
                  }`}
                >
                  <Input
                    value={form.precision}
                    type="number"
                    inputMode="numeric"
                    onChange={({ detail }) => setField('precision', detail.value)}
                  />
                </FormField>

                <FormField
                  label="Leap indicator"
                  description="Warns clients of an upcoming leap second."
                >
                  <Select
                    selectedOption={
                      LEAP_OPTIONS.find((option) => option.value === form.leapIndicator) ?? null
                    }
                    options={[...LEAP_OPTIONS]}
                    onChange={({ detail }) =>
                      setField('leapIndicator', detail.selectedOption.value as LeapIndicator)
                    }
                    selectedAriaLabel="Selected"
                  />
                </FormField>

                <FormField
                  label="Root delay"
                  description="Total round-trip delay to the primary reference, in seconds."
                  errorText={errors.rootDelay}
                  constraintText="0 for a stratum 1 server with a directly attached reference clock."
                >
                  <Input
                    value={form.rootDelay}
                    inputMode="decimal"
                    onChange={({ detail }) => setField('rootDelay', detail.value)}
                  />
                </FormField>

                <FormField
                  label="Root dispersion"
                  description="Maximum error relative to the primary reference, in seconds."
                  errorText={errors.rootDispersion}
                  constraintText={
                    Number.isFinite(Number(form.rootDispersion))
                      ? `Currently ${formatSeconds(Number(form.rootDispersion))}.`
                      : 'Enter a number.'
                  }
                >
                  <Input
                    value={form.rootDispersion}
                    inputMode="decimal"
                    onChange={({ detail }) => setField('rootDispersion', detail.value)}
                  />
                </FormField>
              </ColumnLayout>
            </Container>

            <Container
              header={
                <Header
                  variant="h2"
                  description="Applies only to clients that negotiate NTPv5."
                >
                  NTPv5
                </Header>
              }
            >
              <SpaceBetween size="l">
                <ColumnLayout columns={2}>
                  <FormField
                    label="Timescale"
                    description="The timescale the server serves time on."
                  >
                    <Select
                      selectedOption={
                        TIMESCALE_OPTIONS.find((option) => option.value === form.timescale) ?? null
                      }
                      options={[...TIMESCALE_OPTIONS]}
                      onChange={({ detail }) =>
                        setField('timescale', detail.selectedOption.value as Timescale)
                      }
                      selectedAriaLabel="Selected"
                    />
                  </FormField>

                  <FormField
                    label="NTPv5 reference ID"
                    description="15-byte server identifier, hex encoded."
                    errorText={errors.v5ReferenceId}
                    constraintText="Exactly 30 hexadecimal characters."
                  >
                    <Input
                      value={form.v5ReferenceId}
                      onChange={({ detail }) => setField('v5ReferenceId', detail.value)}
                    />
                  </FormField>
                </ColumnLayout>

                <ExpandableSection headerText="About the NTPv5 reference ID">
                  <Box variant="p">
                    NTPv5 replaces the 4-byte reference ID with a 15-byte identifier used to build
                    a Bloom filter of the servers in a synchronization path. Clients use it to
                    detect timing loops. Give each server in a pool a distinct value.
                  </Box>
                </ExpandableSection>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
      </Form>
    </form>
  );
}

function ServerSettingsHelp() {
  return (
    <HelpPanel header={<h2>Server settings</h2>}>
      <p>
        These values go into the header of every response the server sends. Clients use them to
        decide whether to trust this server and how much error to attribute to it.
      </p>
      <h3>Applied immediately vs on restart</h3>
      <p>
        Clock identity, interleaved mode, and the NTPv5 fields take effect on the next request.
        The listen address and the IPv6-only flag are properties of the bound socket, so they need
        a restart.
      </p>
      <h3>Stratum and reference ID</h3>
      <p>
        Set stratum 1 only when a reference clock is actually attached and locked - a server
        claiming stratum 1 with a drifting system clock will be selected over better sources by
        every client that can reach it. Pair it with a reference ID naming the source, such as{' '}
        <code>GPS</code> or <code>PPS</code>.
      </p>
      <h3>Precision</h3>
      <p>
        Precision describes the resolution of the clock the server reads, not its accuracy.{' '}
        <code>-24</code> is roughly 60 nanoseconds, typical for a system clock read through a
        hardware timestamp counter.
      </p>
      <h3>Interleaved mode</h3>
      <p>
        In interleaved mode the server reports the transmit timestamp of its <i>previous</i>{' '}
        response, which it can capture after the packet is actually on the wire. This removes the
        software send path from the measurement. It requires a client that asks for it, and falls
        back to basic mode otherwise.
      </p>
    </HelpPanel>
  );
}

// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Per-client rate limiting and client table sizing. */

import { useCallback, useState } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
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
import type { RateLimitSettings } from '../api/types';
import { usePageHelp, useOpenHelp } from '../components/help-panel-context';
import { useNotifications } from '../components/notification-context';
import { InfoLink, ValueWithLabel } from '../components/primitives';
import { formatMillis } from '../utils/format';
import { validateIntInRange } from '../utils/validation';

/** Text state for the form, so partial input is never coerced to a number. */
interface FormState {
  enabled: boolean;
  maxRequests: string;
  windowMs: string;
  minIntervalMs: string;
  maxClients: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toFormState(settings: RateLimitSettings): FormState {
  return {
    enabled: settings.enabled,
    maxRequests: String(settings.config.max_requests_per_window),
    windowMs: String(settings.config.window_duration_ms),
    minIntervalMs: String(settings.config.min_interval_ms),
    maxClients: String(settings.max_clients),
  };
}

export function RateLimiting() {
  const openHelp = useOpenHelp();
  usePageHelp(<RateLimitingHelp />);

  const fetcher = useCallback(() => api.getRateLimit(), []);
  const settings = useResource(fetcher);

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          info={<InfoLink onFollow={openHelp} />}
          description="Throttle abusive clients with a per-address request budget. Changes apply immediately."
        >
          Rate limiting
        </Header>
      }
    >
      {settings.data ? (
        // Keying on the resource version remounts the form whenever new settings
        // load, which re-seeds the fields from the server without copying props
        // into state from an effect.
        <RateLimitForm
          key={settings.version}
          initial={settings.data}
          onSaved={settings.setData}
        />
      ) : (
        <Box textAlign="center" padding="xxl">
          {settings.error ? (
            <Alert type="error" header="Could not load rate limit settings">
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

function RateLimitForm({
  initial,
  onSaved,
}: {
  initial: RateLimitSettings;
  onSaved: (next: RateLimitSettings) => void;
}) {
  const { notify } = useNotifications();

  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dirty, setDirty] = useState(false);

  const save = useMutation(
    useCallback((next: RateLimitSettings) => api.updateRateLimit(next), []),
  );

  const setField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setDirty(true);
  };

  const handleSubmit = async () => {
    const nextErrors: FieldErrors = {};

    const maxRequests = validateIntInRange(form.maxRequests, 1, 1_000_000, 'Maximum requests');
    if (!maxRequests.ok) {
      nextErrors.maxRequests = maxRequests.error;
    }

    const windowMs = validateIntInRange(form.windowMs, 100, 3_600_000, 'Window duration');
    if (!windowMs.ok) {
      nextErrors.windowMs = windowMs.error;
    }

    const minIntervalMs = validateIntInRange(form.minIntervalMs, 0, 3_600_000, 'Minimum interval');
    if (!minIntervalMs.ok) {
      nextErrors.minIntervalMs = minIntervalMs.error;
    }

    const maxClients = validateIntInRange(form.maxClients, 1, 10_000_000, 'Maximum clients');
    if (!maxClients.ok) {
      nextErrors.maxClients = maxClients.error;
    }

    // A minimum interval longer than the window would reject every second request
    // regardless of the per-window budget, which is almost never intended.
    if (minIntervalMs.ok && windowMs.ok && minIntervalMs.value > windowMs.value) {
      nextErrors.minIntervalMs =
        'The minimum interval cannot be longer than the window duration.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).some((key) => nextErrors[key as keyof FormState])) {
      notify('error', 'Fix the highlighted fields before saving.', 'Invalid rate limit settings');
      return;
    }

    if (!maxRequests.ok || !windowMs.ok || !minIntervalMs.ok || !maxClients.ok) {
      return;
    }

    const result = await save.run({
      enabled: form.enabled,
      config: {
        max_requests_per_window: maxRequests.value,
        window_duration_ms: windowMs.value,
        min_interval_ms: minIntervalMs.value,
      },
      max_clients: maxClients.value,
    });

    if (result) {
      setDirty(false);
      notify('success', 'Rate limit settings applied to the running server.');
      // Publishing last: this remounts the form with the server's own response.
      onSaved(result);
    } else if (save.error) {
      notify('error', save.error, 'Could not apply rate limit settings');
    }
  };

  // Effective sustained rate, shown so the operator can sanity check the numbers.
  const windowSecs = Number(form.windowMs) / 1000;
  const effectiveRate =
    Number.isFinite(windowSecs) && windowSecs > 0
      ? Number(form.maxRequests) / windowSecs
      : Number.NaN;

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
              Apply changes
            </Button>
          </SpaceBetween>
        }
      >
          <SpaceBetween size="l">
            <Container
              header={
                <Header
                  variant="h2"
                  description="A client that exceeds its budget receives a Kiss-o-Death RATE response."
                >
                  Request budget
                </Header>
              }
            >
              <SpaceBetween size="l">
                <Toggle
                  checked={form.enabled}
                  onChange={({ detail }) => setField('enabled', detail.checked)}
                  description="With rate limiting off, the server answers every request that passes access control."
                >
                  Enforce per-client rate limits
                </Toggle>

                <ColumnLayout columns={2}>
                  <FormField
                    label="Maximum requests per window"
                    description="How many requests one address may send in a single window."
                    errorText={errors.maxRequests}
                    constraintText="1 to 1,000,000."
                  >
                    <Input
                      value={form.maxRequests}
                      type="number"
                      inputMode="numeric"
                      disabled={!form.enabled}
                      onChange={({ detail }) => setField('maxRequests', detail.value)}
                    />
                  </FormField>

                  <FormField
                    label="Window duration"
                    description="Length of the counting window, in milliseconds."
                    errorText={errors.windowMs}
                    constraintText={`100 ms to 1 hour. Currently ${formatMillis(
                      Number(form.windowMs) || 0,
                    )}.`}
                  >
                    <Input
                      value={form.windowMs}
                      type="number"
                      inputMode="numeric"
                      disabled={!form.enabled}
                      onChange={({ detail }) => setField('windowMs', detail.value)}
                    />
                  </FormField>

                  <FormField
                    label="Minimum interval between requests"
                    description="Requests closer together than this are refused, even inside budget."
                    errorText={errors.minIntervalMs}
                    constraintText={`0 disables the check. Currently ${formatMillis(
                      Number(form.minIntervalMs) || 0,
                    )}.`}
                  >
                    <Input
                      value={form.minIntervalMs}
                      type="number"
                      inputMode="numeric"
                      disabled={!form.enabled}
                      onChange={({ detail }) => setField('minIntervalMs', detail.value)}
                    />
                  </FormField>

                  <ValueWithLabel
                    label="Effective sustained rate"
                    description="Derived from the budget and window above."
                  >
                    {Number.isFinite(effectiveRate)
                      ? `${effectiveRate.toFixed(2)} requests per second per client`
                      : '--'}
                  </ValueWithLabel>
                </ColumnLayout>
              </SpaceBetween>
            </Container>

            <Container
              header={
                <Header
                  variant="h2"
                  description="Bounds the memory the server uses to track clients."
                >
                  Client table
                </Header>
              }
            >
              <SpaceBetween size="l">
                <FormField
                  label="Maximum tracked clients"
                  description="When the table is full, the least recently seen entries are reclaimed."
                  errorText={errors.maxClients}
                  constraintText="1 to 10,000,000."
                >
                  <Input
                    value={form.maxClients}
                    type="number"
                    inputMode="numeric"
                    onChange={({ detail }) => setField('maxClients', detail.value)}
                  />
                </FormField>

                <Alert type="info" header="Sizing the table">
                  An entry is a few dozen bytes. Size the table above the number of distinct
                  clients you expect in one window - if it is too small, busy clients evict each
                  other and the rate limit stops being enforced consistently.
                </Alert>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
      </Form>
    </form>
  );
}

function RateLimitingHelp() {
  return (
    <HelpPanel header={<h2>Rate limiting</h2>}>
      <p>
        Rate limiting is per source address and is applied after access control. Each tracked
        client has a request counter that resets when its window elapses.
      </p>
      <h3>The two checks</h3>
      <ul>
        <li>
          <b>Budget</b> - more than the configured maximum within one window is refused.
        </li>
        <li>
          <b>Minimum interval</b> - two requests closer together than this are refused even if the
          client is inside its budget. This catches bursts that a window check alone would allow.
        </li>
      </ul>
      <h3>Choosing values</h3>
      <p>
        RFC 8633 recommends clients poll no more often than every 64 seconds in steady state. A
        budget of 20 requests per 60 second window leaves generous headroom for a client that is
        still converging, while refusing anything that polls in a tight loop.
      </p>
      <h3>What a refused client sees</h3>
      <p>
        The server sends a Kiss-o-Death RATE response rather than dropping the packet. A
        conforming client backs off; one that ignores it keeps being refused at negligible cost to
        the server.
      </p>
    </HelpPanel>
  );
}

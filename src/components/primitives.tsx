// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Small presentational pieces reused across pages. */

import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@cloudscape-design/components/box';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator, {
  type StatusIndicatorProps,
} from '@cloudscape-design/components/status-indicator';

import type { EventLevel, FixQuality, ServiceState } from '../api/types';

/**
 * A label above a value, the standard Cloudscape key/value pair.
 *
 * Labels are sentence case with no trailing colon.
 */
export function ValueWithLabel({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
      {description ? (
        <Box variant="small" color="text-body-secondary">
          {description}
        </Box>
      ) : null}
    </div>
  );
}

/**
 * A stat tile: label, compact value, and optional supporting line.
 *
 * Sized at `heading-xl` rather than a display size: these appear four-up in a
 * row that narrows when the help drawer opens, and a display-size figure wraps
 * mid-number there ("543.68" / "K"), which misreads badly. A dashboard gets at
 * most one true hero figure, and this component is not it.
 */
export function StatTile({
  label,
  value,
  secondary,
  status,
}: {
  label: string;
  value: string;
  secondary?: string;
  status?: ReactNode;
}) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box fontSize="heading-xl" fontWeight="bold" padding={{ bottom: 'xxs' }}>
        {value}
      </Box>
      {status ?? null}
      {secondary ? (
        <Box variant="small" color="text-body-secondary">
          {secondary}
        </Box>
      ) : null}
    </div>
  );
}

const SERVICE_STATE_MAP: Record<
  ServiceState,
  { type: StatusIndicatorProps.Type; label: string }
> = {
  running: { type: 'success', label: 'Running' },
  degraded: { type: 'warning', label: 'Degraded' },
  stopped: { type: 'error', label: 'Stopped' },
  starting: { type: 'in-progress', label: 'Starting' },
};

/** Service health, always with an icon and a text label - never color alone. */
export function ServiceStateIndicator({ state }: { state: ServiceState }) {
  const { type, label } = SERVICE_STATE_MAP[state];
  return <StatusIndicator type={type}>{label}</StatusIndicator>;
}

const FIX_QUALITY_MAP: Record<
  FixQuality,
  { type: StatusIndicatorProps.Type; label: string }
> = {
  invalid: { type: 'error', label: 'No fix' },
  gps: { type: 'success', label: 'GPS fix' },
  dgps: { type: 'success', label: 'Differential GPS' },
  pps: { type: 'success', label: 'PPS locked' },
  rtk: { type: 'success', label: 'RTK fixed' },
  float_rtk: { type: 'info', label: 'RTK float' },
  estimated: { type: 'warning', label: 'Estimated (dead reckoning)' },
};

/** GPS fix quality with an icon and label. */
export function FixQualityIndicator({ quality }: { quality: FixQuality }) {
  const { type, label } = FIX_QUALITY_MAP[quality];
  return <StatusIndicator type={type}>{label}</StatusIndicator>;
}

const EVENT_LEVEL_MAP: Record<
  EventLevel,
  { type: StatusIndicatorProps.Type; label: string }
> = {
  error: { type: 'error', label: 'ERROR' },
  warn: { type: 'warning', label: 'WARN' },
  info: { type: 'info', label: 'INFO' },
  debug: { type: 'pending', label: 'DEBUG' },
  trace: { type: 'pending', label: 'TRACE' },
};

/** Tracing level with an icon and label. */
export function EventLevelIndicator({ level }: { level: EventLevel }) {
  const { type, label } = EVENT_LEVEL_MAP[level];
  return <StatusIndicator type={type}>{label}</StatusIndicator>;
}

/** Boolean capability shown as enabled/disabled with an icon. */
export function EnabledIndicator({
  enabled,
  enabledLabel = 'Enabled',
  disabledLabel = 'Disabled',
}: {
  enabled: boolean;
  enabledLabel?: string;
  disabledLabel?: string;
}) {
  return (
    <StatusIndicator type={enabled ? 'success' : 'stopped'}>
      {enabled ? enabledLabel : disabledLabel}
    </StatusIndicator>
  );
}

/** The `info` link that opens the help drawer, wired by each page header. */
export function InfoLink({ onFollow }: { onFollow: () => void }) {
  return (
    <Link variant="info" onFollow={() => onFollow()}>
      Info
    </Link>
  );
}

/**
 * A Cloudscape link that navigates with the router.
 *
 * Keeps the real `href` so the link is still middle-clickable and shows a
 * target in the status bar, while intercepting the plain click.
 */
export function RouteLink({ to, children }: { to: string; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <Link
      href={to}
      onFollow={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </Link>
  );
}

/** The standard empty state for a table with no rows. */
export function TableEmptyState({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <Box margin={{ vertical: 'xs' }} textAlign="center" color="inherit">
      <SpaceBetween size="xxs">
        <div>
          <Box variant="strong" color="inherit">
            {title}
          </Box>
          <Box variant="p" color="inherit">
            {subtitle}
          </Box>
        </div>
        {action ?? null}
      </SpaceBetween>
    </Box>
  );
}

/** The standard empty state for a table whose filter matched nothing. */
export function TableNoMatchState({ onClearFilter }: { onClearFilter: () => void }) {
  return (
    <TableEmptyState
      title="No matches"
      subtitle="No rows match the current filter."
      action={
        <Link onFollow={() => onClearFilter()}>Clear filter</Link>
      }
    />
  );
}

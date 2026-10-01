// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Display formatting shared across pages. */

import type { IpNet, LeapIndicator, Timescale } from '../api/types';

const integerFormat = new Intl.NumberFormat('en-US');
const decimalFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** Thousands-separated integer, e.g. `1,284,553`. */
export function formatCount(value: number): string {
  return integerFormat.format(Math.round(value));
}

/** Compact magnitude for KPI tiles, e.g. `1.28M`. */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return `${decimalFormat.format(value / 1_000_000_000)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${decimalFormat.format(value / 1_000_000)}M`;
  }
  if (Math.abs(value) >= 10_000) {
    return `${decimalFormat.format(value / 1_000)}K`;
  }
  return integerFormat.format(Math.round(value));
}

/** Rate with a unit suffix, e.g. `842 req/s`. */
export function formatRate(value: number, unit = 'req/s'): string {
  return `${decimalFormat.format(value)} ${unit}`;
}

/**
 * Sub-second durations in the unit that keeps them readable: an NTP offset of
 * 4.2 microseconds should not render as `0.0000042 s`.
 */
export function formatSeconds(value: number): string {
  const abs = Math.abs(value);
  if (abs === 0) {
    return '0 s';
  }
  if (abs < 1e-6) {
    return `${decimalFormat.format(value * 1e9)} ns`;
  }
  if (abs < 1e-3) {
    return `${decimalFormat.format(value * 1e6)} µs`;
  }
  if (abs < 1) {
    return `${decimalFormat.format(value * 1e3)} ms`;
  }
  return `${decimalFormat.format(value)} s`;
}

/** Milliseconds as a human duration, e.g. `60 s` or `1.5 s`. */
export function formatMillis(value: number): string {
  if (value >= 1000) {
    return `${decimalFormat.format(value / 1000)} s`;
  }
  return `${decimalFormat.format(value)} ms`;
}

/** Uptime as `17d 4h 22m`, dropping leading zero units. */
export function formatUptime(totalSecs: number): string {
  const days = Math.floor(totalSecs / 86_400);
  const hours = Math.floor((totalSecs % 86_400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (days > 0 || hours > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

/** Absolute UTC timestamp, e.g. `2026-10-01 14:32:08 UTC`. */
export function formatTimestamp(epochMs: number): string {
  const iso = new Date(epochMs).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

/** Clock time only, for chart axes. */
export function formatClockTime(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(11, 19);
}

/** Relative age, e.g. `4s ago` or `2h ago`. */
export function formatRelative(epochMs: number, now = Date.now()): string {
  const deltaSecs = Math.max(0, Math.round((now - epochMs) / 1000));
  if (deltaSecs < 60) {
    return `${deltaSecs}s ago`;
  }
  if (deltaSecs < 3600) {
    return `${Math.floor(deltaSecs / 60)}m ago`;
  }
  if (deltaSecs < 86_400) {
    return `${Math.floor(deltaSecs / 3600)}h ago`;
  }
  return `${Math.floor(deltaSecs / 86_400)}d ago`;
}

/** Render an `IpNet` back to CIDR notation. */
export function formatCidr(net: IpNet): string {
  return `${net.addr}/${net.prefix_len}`;
}

/** Percentage with one decimal, guarding against a zero denominator. */
export function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) {
    return '0.0%';
  }
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

const LEAP_LABELS: Record<LeapIndicator, string> = {
  no_warning: 'No warning',
  add_one: 'Add one second',
  sub_one: 'Subtract one second',
  unknown: 'Unknown (unsynchronized)',
};

/** Human label for a leap indicator. */
export function formatLeapIndicator(value: LeapIndicator): string {
  return LEAP_LABELS[value];
}

const TIMESCALE_LABELS: Record<Timescale, string> = {
  utc: 'UTC',
  tai: 'TAI',
  ut1: 'UT1',
  leap_smeared_utc: 'Leap-smeared UTC',
};

/** Human label for an NTPv5 timescale. */
export function formatTimescale(value: Timescale): string {
  return TIMESCALE_LABELS[value];
}

/** Stratum with its conventional meaning, e.g. `1 (primary reference)`. */
export function formatStratum(stratum: number): string {
  if (stratum === 0) {
    return '0 (unspecified / KoD)';
  }
  if (stratum === 1) {
    return '1 (primary reference)';
  }
  if (stratum <= 15) {
    return `${stratum} (secondary reference)`;
  }
  return `${stratum} (unsynchronized)`;
}

// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Client-side validation for the configuration forms.
 *
 * The server validates everything again; this exists to give immediate,
 * specific feedback rather than a round trip and a generic 400.
 */

import type { IpNet } from '../api/types';

/** A validation outcome: either a parsed value or a message to show the user. */
export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function isIpv4(address: string): boolean {
  const octets = address.split('.');
  if (octets.length !== 4) {
    return false;
  }
  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false;
    }
    // Reject leading zeros, which are ambiguous (octal in some parsers).
    if (octet.length > 1 && octet.startsWith('0')) {
      return false;
    }
    return Number(octet) <= 255;
  });
}

function isIpv6(address: string): boolean {
  // At most one `::` run, and no empty groups outside of it.
  const doubleColonCount = (address.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) {
    return false;
  }
  if (address.includes(':::')) {
    return false;
  }

  const [head, tail] = doubleColonCount === 1 ? address.split('::') : [address, undefined];
  const headGroups = head === '' ? [] : head.split(':');
  const tailGroups = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups = [...headGroups, ...tailGroups];

  if (groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    return false;
  }
  if (doubleColonCount === 0) {
    return groups.length === 8;
  }
  return groups.length <= 7;
}

/** Whether a string is a valid IPv4 or IPv6 literal. */
export function isIpAddress(address: string): boolean {
  return address.includes(':') ? isIpv6(address) : isIpv4(address);
}

/**
 * Parse CIDR notation into an `IpNet`.
 *
 * Accepts a bare address too, defaulting to a host prefix (/32 or /128), which
 * is what an operator usually means when they type a single IP into an
 * allow or deny list.
 */
export function parseCidr(input: string): Validated<IpNet> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter an IP address or CIDR block.' };
  }

  const slashCount = (trimmed.match(/\//g) ?? []).length;
  if (slashCount > 1) {
    return { ok: false, error: 'Use a single "/" to separate the address from the prefix.' };
  }

  const [addr, prefixText] = slashCount === 1 ? trimmed.split('/') : [trimmed, undefined];

  if (!isIpAddress(addr)) {
    return {
      ok: false,
      error: `"${addr}" is not a valid IPv4 or IPv6 address.`,
    };
  }

  const isV6 = addr.includes(':');
  const maxPrefix = isV6 ? 128 : 32;

  if (prefixText === undefined) {
    return { ok: true, value: { addr, prefix_len: maxPrefix } };
  }

  if (!/^\d{1,3}$/.test(prefixText)) {
    return { ok: false, error: 'The prefix length must be a number.' };
  }

  const prefixLen = Number(prefixText);
  if (prefixLen > maxPrefix) {
    return {
      ok: false,
      error: `The prefix length for an ${isV6 ? 'IPv6' : 'IPv4'} block must be 0-${maxPrefix}.`,
    };
  }

  return { ok: true, value: { addr, prefix_len: prefixLen } };
}

/**
 * Validate a socket address such as `[::]:123`, `0.0.0.0:123`, or
 * `ntp.example.mil:123`.
 */
export function validateListenAddress(input: string): Validated<string> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter an address and port, for example [::]:123.' };
  }

  // Bracketed IPv6 form: [addr]:port
  const bracketed = /^\[([^\]]+)\]:(\d{1,5})$/.exec(trimmed);
  if (bracketed) {
    const [, addr, portText] = bracketed;
    if (!isIpv6(addr)) {
      return { ok: false, error: `"${addr}" is not a valid IPv6 address.` };
    }
    return validatePortOnly(trimmed, portText);
  }

  if (trimmed.startsWith('[')) {
    return { ok: false, error: 'An IPv6 address must be written as [address]:port.' };
  }

  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon === -1) {
    return { ok: false, error: 'Include a port, for example [::]:123.' };
  }

  const host = trimmed.slice(0, lastColon);
  const portText = trimmed.slice(lastColon + 1);

  if (host === '') {
    return { ok: false, error: 'Include an address before the port.' };
  }
  if (host.includes(':')) {
    return { ok: false, error: 'An IPv6 address must be written as [address]:port.' };
  }

  const isHostname = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(
    host,
  );
  if (!isIpv4(host) && !isHostname) {
    return { ok: false, error: `"${host}" is not a valid IPv4 address or hostname.` };
  }

  return validatePortOnly(trimmed, portText);
}

function validatePortOnly(full: string, portText: string): Validated<string> {
  if (!/^\d{1,5}$/.test(portText)) {
    return { ok: false, error: 'The port must be a number.' };
  }
  const port = Number(portText);
  if (port < 1 || port > 65_535) {
    return { ok: false, error: 'The port must be between 1 and 65535.' };
  }
  return { ok: true, value: full };
}

/** Validate an integer field against an inclusive range. */
export function validateIntInRange(
  input: string,
  min: number,
  max: number,
  label: string,
): Validated<number> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: `${label} is required.` };
  }
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, error: `${label} must be a whole number.` };
  }
  const value = Number(trimmed);
  if (value < min || value > max) {
    return { ok: false, error: `${label} must be between ${min} and ${max}.` };
  }
  return { ok: true, value };
}

/** Validate a non-negative decimal field, e.g. root delay in seconds. */
export function validateNonNegativeFloat(input: string, label: string): Validated<number> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: `${label} is required.` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label} must be a number.` };
  }
  if (value < 0) {
    return { ok: false, error: `${label} cannot be negative.` };
  }
  return { ok: true, value };
}

/** Validate an NTP reference ID: 1-4 printable ASCII characters. */
export function validateReferenceId(input: string): Validated<string> {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter a reference ID, for example GPS.' };
  }
  if (trimmed.length > 4) {
    return { ok: false, error: 'A reference ID is at most 4 characters.' };
  }
  if (!/^[\x21-\x7e]+$/.test(trimmed)) {
    return { ok: false, error: 'Use printable ASCII characters only.' };
  }
  return { ok: true, value: trimmed };
}

/** Validate the NTPv5 reference ID: exactly 15 bytes, hex encoded. */
export function validateV5ReferenceId(input: string): Validated<string> {
  const trimmed = input.trim().toLowerCase();
  if (!/^[0-9a-f]{30}$/.test(trimmed)) {
    return {
      ok: false,
      error: 'Enter exactly 30 hexadecimal characters (15 bytes).',
    };
  }
  return { ok: true, value: trimmed };
}

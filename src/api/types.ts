// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Wire types for the ntp_usg management API.
 *
 * These mirror the public Rust structs in `ntp_usg-server` so the UI and the
 * server agree on one shape. Field names are snake_case to match the Rust
 * `serde` defaults. See `docs/API.md` for the endpoint contract.
 */

/** Leap second indicator - `ntp_proto::protocol::LeapIndicator`. */
export type LeapIndicator = 'no_warning' | 'add_one' | 'sub_one' | 'unknown';

/** NTPv5 timescale - `ntp_proto::protocol::ntpv5::Timescale`. */
export type Timescale = 'utc' | 'tai' | 'ut1' | 'leap_smeared_utc';

/** Overall health of the running server. */
export type ServiceState = 'running' | 'degraded' | 'stopped' | 'starting';

/** An IPv4/IPv6 network in CIDR form - `ntp_server::server_common::IpNet`. */
export interface IpNet {
  /** Network address, e.g. `10.0.0.0` or `2001:db8::`. */
  addr: string;
  /** Prefix length in bits. */
  prefix_len: number;
}

/** `ntp_server::server_common::MetricsSnapshot`. */
export interface MetricsSnapshot {
  /** Total NTP requests received (valid + invalid). */
  requests_received: number;
  /** Total valid responses sent. */
  responses_sent: number;
  /** Requests dropped (invalid packet, parse error). */
  requests_dropped: number;
  /** KoD DENY responses sent (access denied). */
  kod_deny_sent: number;
  /** KoD RSTR responses sent (access restricted). */
  kod_rstr_sent: number;
  /** KoD RATE responses sent (rate limited). */
  kod_rate_sent: number;
  /** Interleaved mode responses sent (RFC 9769). */
  interleaved_responses: number;
  /** Current number of tracked clients in the client table. */
  active_clients: number;
}

/** One sample in a metrics time series. */
export interface MetricSample {
  /** Unix epoch milliseconds. */
  timestamp: number;
  /** Requests per second over the preceding interval. */
  requests_per_sec: number;
  /** Responses per second over the preceding interval. */
  responses_per_sec: number;
  /** Dropped requests per second over the preceding interval. */
  dropped_per_sec: number;
  /** Kiss-o-Death responses per second (all three kinds combined). */
  kod_per_sec: number;
}

/** Service identity and clock state, read once per dashboard poll. */
export interface ServerStatus {
  state: ServiceState;
  /** Crate version of the running server, e.g. `5.0.0`. */
  version: string;
  /** Seconds since the server started. */
  uptime_secs: number;
  /** NTP stratum, 0-16. */
  stratum: number;
  /** Four-character reference ID, e.g. `GPS` or an IPv4 address. */
  reference_id: string;
  /** Clock precision as a power of two, e.g. -24. */
  precision: number;
  leap_indicator: LeapIndicator;
  /** Root delay in seconds. */
  root_delay: number;
  /** Root dispersion in seconds. */
  root_dispersion: number;
  /** Addresses the server is bound to. */
  listeners: Listener[];
  /** Cargo features compiled into this build. */
  enabled_features: string[];
}

/** One bound socket. */
export interface Listener {
  /** Socket address, e.g. `[::]:123`. */
  address: string;
  protocol: 'ntp-udp' | 'nts-ke-tcp';
  /** Whether the socket is accepting traffic. */
  healthy: boolean;
}

/** A row in the server client table - derived from `ClientState`. */
export interface ClientEntry {
  /** Client IP address. */
  address: string;
  /** Requests seen in the current rate-limit window. */
  requests_in_window: number;
  /** Total requests seen since the entry was created. */
  total_requests: number;
  /** Unix epoch milliseconds of the most recent request. */
  last_seen: number;
  /** KoD responses sent to this client. */
  kod_sent: number;
  /** Whether this client is currently being rate limited. */
  rate_limited: boolean;
  /** Highest NTP version this client has requested with. */
  ntp_version: 3 | 4 | 5;
  /** Whether requests from this client are NTS-authenticated. */
  nts: boolean;
}

/** `ntp_server::server_common::AccessControl`. */
export interface AccessControlConfig {
  /** When set, only these networks may query the server. */
  allow_list: IpNet[] | null;
  /** Networks that are refused with a KoD DENY. */
  deny_list: IpNet[] | null;
}

/** `ntp_server::server_common::RateLimitConfig`. */
export interface RateLimitConfig {
  /** Maximum requests permitted per window. */
  max_requests_per_window: number;
  /** Window length in milliseconds. */
  window_duration_ms: number;
  /** Minimum spacing between requests, in milliseconds. */
  min_interval_ms: number;
}

/** Rate limiting is optional - `Option<RateLimitConfig>` on the Rust side. */
export interface RateLimitSettings {
  enabled: boolean;
  config: RateLimitConfig;
  /** Upper bound on client table entries (`max_clients` on the builder). */
  max_clients: number;
}

/** Protocol-level settings from `NtpServerBuilder`. */
export interface ServerSettings {
  /** Socket address to bind, e.g. `[::]:123`. */
  listen: string;
  stratum: number;
  reference_id: string;
  precision: number;
  leap_indicator: LeapIndicator;
  root_delay: number;
  root_dispersion: number;
  /** Interleaved mode, RFC 9769. */
  enable_interleaved: boolean;
  /** Bind IPv6 sockets without the IPv4-mapped dual stack. */
  v6only: boolean;
  /** DSCP marking for outgoing packets, 0-63. */
  dscp: number;
  /** NTPv5 timescale. */
  timescale: Timescale;
  /** NTPv5 15-byte reference ID, hex encoded. */
  v5_reference_id: string;
}

/** NTS-KE and cookie state (RFC 8915). */
export interface NtsStatus {
  enabled: boolean;
  /** NTS-KE listener address. */
  ke_address: string;
  /** Certificate subject common name. */
  cert_subject: string;
  /** Certificate expiry, unix epoch milliseconds. */
  cert_expires: number;
  /** Negotiated ALPN protocol identifier. */
  alpn: string;
  /** Whether post-quantum key exchange (X25519MLKEM768) is offered. */
  post_quantum: boolean;
  /** AEAD algorithm used for cookies. */
  aead_algorithm: string;
  /** Unix epoch milliseconds of the last cookie key rotation. */
  last_key_rotation: number;
  /** Successful NTS-KE handshakes since start. */
  handshakes_completed: number;
  /** Failed NTS-KE handshakes since start. */
  handshakes_failed: number;
}

/** GPS fix quality - `ntp_client::refclock::nmea::FixQuality`. */
export type FixQuality =
  | 'invalid'
  | 'gps'
  | 'dgps'
  | 'pps'
  | 'rtk'
  | 'float_rtk'
  | 'estimated';

/** A configured reference clock (GPS, PPS, or the local fallback). */
export interface RefClockStatus {
  id: string;
  kind: 'gps' | 'pps' | 'local';
  /** Device path, e.g. `/dev/ttyS0` or `/dev/pps0`. */
  device: string;
  /** Whether the driver is producing samples. */
  active: boolean;
  /** Offset from the reference in seconds. */
  offset: number;
  /** Estimated dispersion in seconds. */
  dispersion: number;
  /** GPS only: current fix quality. */
  fix_quality?: FixQuality;
  /** GPS only: satellites used in the fix. */
  satellites?: number;
  /** PPS only: pulses captured since start. */
  pulse_count?: number;
  /** Unix epoch milliseconds of the most recent sample. */
  last_sample: number;
}

/** Severity of a server event, matching `tracing` levels. */
export type EventLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** One structured log record from the server `tracing` subscriber. */
export interface ServerEvent {
  id: string;
  /** Unix epoch milliseconds. */
  timestamp: number;
  level: EventLevel;
  /** Tracing target, e.g. `ntp_server::server`. */
  target: string;
  message: string;
}

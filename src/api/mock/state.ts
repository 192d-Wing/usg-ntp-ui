// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * In-memory simulation of a running ntp_usg server.
 *
 * This exists so the UI can be developed and demoed without a live server. It
 * advances counters on a wall-clock schedule, which means polling, rate charts,
 * and the client table all behave the way they would against the real thing.
 * Swap it out by pointing `VITE_API_BASE_URL` at a real server - see
 * `src/api/client.ts`.
 */

import type {
  AccessControlConfig,
  ClientEntry,
  MetricSample,
  MetricsSnapshot,
  NtsStatus,
  RateLimitSettings,
  RefClockStatus,
  ServerEvent,
  ServerSettings,
  ServerStatus,
} from '../types';

/** How many history samples to retain (10 min at 5s resolution). */
const HISTORY_LIMIT = 120;

/** Seconds between synthetic history samples. */
const SAMPLE_INTERVAL_SECS = 5;

const START_TIME = Date.now();

/** Deterministic pseudo-random generator so reloads look stable. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const rng = makeRng(0x4e5450);

function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

/**
 * Baseline request rate with a diurnal shape, so the dashboard chart shows
 * something more interesting than a flat line.
 */
function baseRate(atMs: number): number {
  const hour = new Date(atMs).getUTCHours() + new Date(atMs).getUTCMinutes() / 60;
  const diurnal = Math.sin(((hour - 6) / 24) * 2 * Math.PI);
  return 820 + diurnal * 260;
}

interface MockState {
  metrics: MetricsSnapshot;
  history: MetricSample[];
  clients: ClientEntry[];
  accessControl: AccessControlConfig;
  rateLimit: RateLimitSettings;
  settings: ServerSettings;
  nts: NtsStatus;
  refClocks: RefClockStatus[];
  events: ServerEvent[];
  lastTick: number;
}

const CLIENT_SEEDS: ReadonlyArray<{ address: string; version: 3 | 4 | 5; nts: boolean }> = [
  { address: '10.12.0.44', version: 4, nts: true },
  { address: '10.12.0.45', version: 4, nts: true },
  { address: '10.12.4.19', version: 4, nts: false },
  { address: '10.12.4.20', version: 3, nts: false },
  { address: '172.16.8.101', version: 5, nts: true },
  { address: '172.16.8.102', version: 5, nts: true },
  { address: '192.168.40.7', version: 4, nts: false },
  { address: '192.168.40.8', version: 4, nts: false },
  { address: '203.0.113.17', version: 3, nts: false },
  { address: '203.0.113.99', version: 4, nts: false },
  { address: '2001:db8:1::a1', version: 5, nts: true },
  { address: '2001:db8:1::a2', version: 4, nts: true },
  { address: '2001:db8:42::7', version: 4, nts: false },
  { address: '198.51.100.23', version: 4, nts: false },
  { address: '198.51.100.24', version: 3, nts: false },
];

const EVENT_TEMPLATES: ReadonlyArray<Pick<ServerEvent, 'level' | 'target' | 'message'>> = [
  {
    level: 'info',
    target: 'ntp_server::server',
    message: 'responded to client request in interleaved mode',
  },
  {
    level: 'info',
    target: 'ntp_server::nts_ke_server',
    message: 'NTS-KE handshake completed, 8 cookies issued',
  },
  {
    level: 'warn',
    target: 'ntp_server::server_common::rate_limit',
    message: 'rate limit exceeded, sent KoD RATE',
  },
  {
    level: 'warn',
    target: 'ntp_server::server_common::access_control',
    message: 'request from denied network, sent KoD DENY',
  },
  {
    level: 'debug',
    target: 'ntp_server::server_common::validation',
    message: 'dropped malformed packet, length below 48 bytes',
  },
  {
    level: 'info',
    target: 'ntp_client::refclock::gps',
    message: 'GPS fix acquired, 11 satellites in view',
  },
  {
    level: 'error',
    target: 'ntp_server::nts_ke_server',
    message: 'TLS handshake failed, unsupported protocol version',
  },
];

function initialClients(now: number): ClientEntry[] {
  return CLIENT_SEEDS.map((seed) => ({
    address: seed.address,
    requests_in_window: randomInt(1, 18),
    total_requests: randomInt(400, 90_000),
    last_seen: now - randomInt(0, 240) * 1000,
    kod_sent: randomInt(0, 4),
    rate_limited: false,
    ntp_version: seed.version,
    nts: seed.nts,
  }));
}

function initialHistory(now: number): MetricSample[] {
  const samples: MetricSample[] = [];
  for (let i = HISTORY_LIMIT - 1; i >= 0; i -= 1) {
    const timestamp = now - i * SAMPLE_INTERVAL_SECS * 1000;
    samples.push(synthesizeSample(timestamp));
  }
  return samples;
}

function synthesizeSample(timestamp: number): MetricSample {
  const requests = Math.max(0, baseRate(timestamp) + randomInt(-70, 70));
  const dropped = Math.max(0, randomInt(0, 6));
  const kod = Math.max(0, randomInt(0, 9));
  return {
    timestamp,
    requests_per_sec: Math.round(requests),
    responses_per_sec: Math.round(requests - dropped - kod),
    dropped_per_sec: dropped,
    kod_per_sec: kod,
  };
}

function initialState(): MockState {
  const now = Date.now();
  const history = initialHistory(now);
  const totalRequests = history.reduce(
    (sum, sample) => sum + sample.requests_per_sec * SAMPLE_INTERVAL_SECS,
    0,
  );
  const clients = initialClients(now);

  return {
    metrics: {
      requests_received: totalRequests,
      responses_sent: Math.round(totalRequests * 0.991),
      requests_dropped: Math.round(totalRequests * 0.0023),
      kod_deny_sent: Math.round(totalRequests * 0.0019),
      kod_rstr_sent: Math.round(totalRequests * 0.0004),
      kod_rate_sent: Math.round(totalRequests * 0.0042),
      interleaved_responses: Math.round(totalRequests * 0.31),
      active_clients: clients.length,
    },
    history,
    clients,
    accessControl: {
      allow_list: [
        { addr: '10.0.0.0', prefix_len: 8 },
        { addr: '172.16.0.0', prefix_len: 12 },
        { addr: '192.168.0.0', prefix_len: 16 },
        { addr: '2001:db8::', prefix_len: 32 },
      ],
      deny_list: [
        { addr: '203.0.113.0', prefix_len: 24 },
        { addr: '198.51.100.0', prefix_len: 24 },
      ],
    },
    rateLimit: {
      enabled: true,
      config: {
        max_requests_per_window: 20,
        window_duration_ms: 60_000,
        min_interval_ms: 1_000,
      },
      max_clients: 10_000,
    },
    settings: {
      listen: '[::]:123',
      stratum: 1,
      reference_id: 'GPS',
      precision: -24,
      leap_indicator: 'no_warning',
      root_delay: 0,
      root_dispersion: 0.000015,
      enable_interleaved: true,
      v6only: false,
      dscp: 46,
      timescale: 'utc',
      v5_reference_id: '00112233445566778899aabbccddee',
    },
    nts: {
      enabled: true,
      ke_address: '[::]:4460',
      cert_subject: 'ntp.example.mil',
      cert_expires: now + 67 * 24 * 3600 * 1000,
      alpn: 'ntske/1',
      post_quantum: true,
      aead_algorithm: 'AEAD_AES_SIV_CMAC_256',
      last_key_rotation: now - 3 * 3600 * 1000,
      handshakes_completed: 48_211,
      handshakes_failed: 37,
    },
    refClocks: [
      {
        id: 'gps0',
        kind: 'gps',
        device: '/dev/ttyS0',
        active: true,
        offset: 0.0000042,
        dispersion: 0.000015,
        fix_quality: 'pps',
        satellites: 11,
        last_sample: now - 900,
      },
      {
        id: 'pps0',
        kind: 'pps',
        device: '/dev/pps0',
        active: true,
        offset: -0.0000008,
        dispersion: 0.000002,
        pulse_count: 1_284_553,
        last_sample: now - 400,
      },
      {
        id: 'local',
        kind: 'local',
        device: 'system clock',
        active: false,
        offset: 0.00031,
        dispersion: 0.01,
        last_sample: now - 60_000,
      },
    ],
    events: EVENT_TEMPLATES.slice(0, 6).map((template, index) => ({
      id: `evt-${index}`,
      timestamp: now - index * 12_000,
      ...template,
    })),
    lastTick: now,
  };
}

const state: MockState = initialState();
let eventCounter = state.events.length;

/**
 * Advance the simulation to the present. Called before every read so the data
 * is consistent no matter how often the UI polls.
 */
function tick(): void {
  const now = Date.now();
  const elapsedMs = now - state.lastTick;
  if (elapsedMs < 1000) {
    return;
  }
  state.lastTick = now;
  const elapsedSecs = elapsedMs / 1000;

  // Advance cumulative counters by the current rate.
  const sample = synthesizeSample(now);
  state.metrics.requests_received += Math.round(sample.requests_per_sec * elapsedSecs);
  state.metrics.responses_sent += Math.round(sample.responses_per_sec * elapsedSecs);
  state.metrics.requests_dropped += Math.round(sample.dropped_per_sec * elapsedSecs);
  state.metrics.kod_rate_sent += Math.round(sample.kod_per_sec * 0.7 * elapsedSecs);
  state.metrics.kod_deny_sent += Math.round(sample.kod_per_sec * 0.25 * elapsedSecs);
  state.metrics.kod_rstr_sent += Math.round(sample.kod_per_sec * 0.05 * elapsedSecs);
  state.metrics.interleaved_responses += Math.round(
    sample.responses_per_sec * 0.31 * elapsedSecs,
  );

  // Append history samples at a fixed resolution.
  const lastSampleAt = state.history.at(-1)?.timestamp ?? now;
  for (
    let ts = lastSampleAt + SAMPLE_INTERVAL_SECS * 1000;
    ts <= now;
    ts += SAMPLE_INTERVAL_SECS * 1000
  ) {
    state.history.push(synthesizeSample(ts));
  }
  if (state.history.length > HISTORY_LIMIT) {
    state.history.splice(0, state.history.length - HISTORY_LIMIT);
  }

  // Churn the client table: refresh some rows, flip a rate limit now and then.
  for (const client of state.clients) {
    if (rng() < 0.4) {
      const newRequests = randomInt(1, 6);
      client.total_requests += newRequests;
      client.requests_in_window = Math.min(
        client.requests_in_window + newRequests,
        state.rateLimit.config.max_requests_per_window + 8,
      );
      client.last_seen = now - randomInt(0, 3) * 1000;
    } else if (rng() < 0.2) {
      client.requests_in_window = Math.max(0, client.requests_in_window - randomInt(1, 4));
    }
    const overLimit =
      state.rateLimit.enabled &&
      client.requests_in_window > state.rateLimit.config.max_requests_per_window;
    if (overLimit && !client.rate_limited) {
      client.kod_sent += 1;
    }
    client.rate_limited = overLimit;
  }
  state.metrics.active_clients = state.clients.length;

  // Emit an occasional event.
  if (rng() < 0.5) {
    eventCounter += 1;
    state.events.unshift({
      id: `evt-${eventCounter}`,
      timestamp: now,
      ...pick(EVENT_TEMPLATES),
    });
    state.events = state.events.slice(0, 200);
  }

  // Nudge reference clock readings.
  for (const clock of state.refClocks) {
    if (!clock.active) {
      continue;
    }
    clock.offset += (rng() - 0.5) * 1e-6;
    clock.last_sample = now - randomInt(0, 1200);
    if (clock.kind === 'gps') {
      clock.satellites = Math.max(4, Math.min(14, (clock.satellites ?? 10) + randomInt(-1, 1)));
    }
    if (clock.kind === 'pps') {
      clock.pulse_count = (clock.pulse_count ?? 0) + Math.round(elapsedSecs);
    }
  }
}

function deepCopy<T>(value: T): T {
  return structuredClone(value);
}

/** Read-side accessors. Each ticks the simulation first. */
export const mockDb = {
  status(): ServerStatus {
    tick();
    return {
      state: 'running',
      version: '5.0.0',
      uptime_secs: Math.floor((Date.now() - START_TIME) / 1000) + 1_472_900,
      stratum: state.settings.stratum,
      reference_id: state.settings.reference_id,
      precision: state.settings.precision,
      leap_indicator: state.settings.leap_indicator,
      root_delay: state.settings.root_delay,
      root_dispersion: state.settings.root_dispersion,
      listeners: [
        { address: state.settings.listen, protocol: 'ntp-udp', healthy: true },
        {
          address: state.nts.ke_address,
          protocol: 'nts-ke-tcp',
          healthy: state.nts.enabled,
        },
      ],
      enabled_features: [
        'tokio',
        'nts',
        'pq-nts',
        'ntpv5',
        'refclock',
        'gps',
        'pps',
        'socket-opts',
      ],
    };
  },

  metrics(): MetricsSnapshot {
    tick();
    return deepCopy(state.metrics);
  },

  history(): MetricSample[] {
    tick();
    return deepCopy(state.history);
  },

  clients(): ClientEntry[] {
    tick();
    return deepCopy(state.clients);
  },

  evictClient(address: string): void {
    tick();
    state.clients = state.clients.filter((client) => client.address !== address);
    state.metrics.active_clients = state.clients.length;
  },

  accessControl(): AccessControlConfig {
    return deepCopy(state.accessControl);
  },

  setAccessControl(next: AccessControlConfig): AccessControlConfig {
    state.accessControl = deepCopy(next);
    return deepCopy(state.accessControl);
  },

  rateLimit(): RateLimitSettings {
    return deepCopy(state.rateLimit);
  },

  setRateLimit(next: RateLimitSettings): RateLimitSettings {
    state.rateLimit = deepCopy(next);
    return deepCopy(state.rateLimit);
  },

  settings(): ServerSettings {
    return deepCopy(state.settings);
  },

  setSettings(next: ServerSettings): ServerSettings {
    state.settings = deepCopy(next);
    return deepCopy(state.settings);
  },

  nts(): NtsStatus {
    tick();
    return deepCopy(state.nts);
  },

  rotateNtsKeys(): NtsStatus {
    state.nts.last_key_rotation = Date.now();
    return deepCopy(state.nts);
  },

  refClocks(): RefClockStatus[] {
    tick();
    return deepCopy(state.refClocks);
  },

  events(): ServerEvent[] {
    tick();
    return deepCopy(state.events);
  },
};

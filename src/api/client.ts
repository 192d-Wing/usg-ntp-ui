// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * The single place the UI talks to a server.
 *
 * Two transports implement the same interface:
 *
 * - `mock` (default) drives the in-memory simulation in `./mock/state.ts`.
 * - `http` issues real requests against a management API.
 *
 * Set `VITE_API_BASE_URL` to switch to `http`. The endpoint contract the HTTP
 * transport expects is documented in `docs/API.md`; nothing in the rest of the
 * UI depends on which transport is active.
 */

import { mockDb } from './mock/state';
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
} from './types';

/** Base URL of a real management API, if one is configured. */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

/** Which transport is active. Surfaced in the UI so demo data is never mistaken for live data. */
export const transport: 'http' | 'mock' = BASE_URL ? 'http' : 'mock';

/** Simulated latency for the mock transport, in milliseconds. */
const MOCK_LATENCY_MS = 180;

/** An API call that failed. Carries the HTTP status when there was one. */
export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), MOCK_LATENCY_MS);
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new ApiError(
      `Could not reach the management API at ${BASE_URL}${path}. ${
        cause instanceof Error ? cause.message : 'Network request failed.'
      }`,
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `${init?.method ?? 'GET'} ${path} failed with ${response.status} ${response.statusText}.`,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** The operations every transport provides. */
export interface NtpApi {
  getStatus(): Promise<ServerStatus>;
  getMetrics(): Promise<MetricsSnapshot>;
  getMetricsHistory(): Promise<MetricSample[]>;
  getClients(): Promise<ClientEntry[]>;
  evictClient(address: string): Promise<void>;
  getAccessControl(): Promise<AccessControlConfig>;
  updateAccessControl(config: AccessControlConfig): Promise<AccessControlConfig>;
  getRateLimit(): Promise<RateLimitSettings>;
  updateRateLimit(settings: RateLimitSettings): Promise<RateLimitSettings>;
  getServerSettings(): Promise<ServerSettings>;
  updateServerSettings(settings: ServerSettings): Promise<ServerSettings>;
  getNtsStatus(): Promise<NtsStatus>;
  rotateNtsKeys(): Promise<NtsStatus>;
  getRefClocks(): Promise<RefClockStatus[]>;
  getEvents(): Promise<ServerEvent[]>;
}

const httpApi: NtpApi = {
  getStatus: () => request('/api/v1/status'),
  getMetrics: () => request('/api/v1/metrics'),
  getMetricsHistory: () => request('/api/v1/metrics/history'),
  getClients: () => request('/api/v1/clients'),
  evictClient: (address) =>
    request(`/api/v1/clients/${encodeURIComponent(address)}`, { method: 'DELETE' }),
  getAccessControl: () => request('/api/v1/config/access-control'),
  updateAccessControl: (config) =>
    request('/api/v1/config/access-control', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getRateLimit: () => request('/api/v1/config/rate-limit'),
  updateRateLimit: (settings) =>
    request('/api/v1/config/rate-limit', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getServerSettings: () => request('/api/v1/config/server'),
  updateServerSettings: (settings) =>
    request('/api/v1/config/server', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getNtsStatus: () => request('/api/v1/nts'),
  rotateNtsKeys: () => request('/api/v1/nts/rotate-keys', { method: 'POST' }),
  getRefClocks: () => request('/api/v1/refclocks'),
  getEvents: () => request('/api/v1/events'),
};

const mockApi: NtpApi = {
  getStatus: () => delay(mockDb.status()),
  getMetrics: () => delay(mockDb.metrics()),
  getMetricsHistory: () => delay(mockDb.history()),
  getClients: () => delay(mockDb.clients()),
  evictClient: (address) => delay(mockDb.evictClient(address)),
  getAccessControl: () => delay(mockDb.accessControl()),
  updateAccessControl: (config) => delay(mockDb.setAccessControl(config)),
  getRateLimit: () => delay(mockDb.rateLimit()),
  updateRateLimit: (settings) => delay(mockDb.setRateLimit(settings)),
  getServerSettings: () => delay(mockDb.settings()),
  updateServerSettings: (settings) => delay(mockDb.setSettings(settings)),
  getNtsStatus: () => delay(mockDb.nts()),
  rotateNtsKeys: () => delay(mockDb.rotateNtsKeys()),
  getRefClocks: () => delay(mockDb.refClocks()),
  getEvents: () => delay(mockDb.events()),
};

export const api: NtpApi = transport === 'http' ? httpApi : mockApi;

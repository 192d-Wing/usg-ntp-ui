# Management API contract

This console talks to a single HTTP API. The contract below is what the `http`
transport in [`src/api/client.ts`](../src/api/client.ts) expects; the TypeScript
shapes are in [`src/api/types.ts`](../src/api/types.ts).

**The `ntp_usg` server does not currently expose this API.** No HTTP surface
exists in the `ntp_usg-server` crate today — the data it would serve is
reachable only in-process, through `ServerMetrics::snapshot()`, `ConfigHandle`,
and the `NtpServerBuilder`. Until something implements these endpoints the
console runs against the in-memory simulation in `src/api/mock/`. This document
is the specification for whoever builds that layer.

All payloads are JSON with `content-type: application/json`. Field names are
`snake_case` to match the Rust `serde` defaults, so most types can derive
`Serialize`/`Deserialize` directly from the existing structs.

## Endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/v1/status` | — | `ServerStatus` |
| GET | `/api/v1/metrics` | — | `MetricsSnapshot` |
| GET | `/api/v1/metrics/history` | — | `MetricSample[]` |
| GET | `/api/v1/clients` | — | `ClientEntry[]` |
| DELETE | `/api/v1/clients/{address}` | — | `204 No Content` |
| GET | `/api/v1/config/access-control` | — | `AccessControlConfig` |
| PUT | `/api/v1/config/access-control` | `AccessControlConfig` | `AccessControlConfig` |
| GET | `/api/v1/config/rate-limit` | — | `RateLimitSettings` |
| PUT | `/api/v1/config/rate-limit` | `RateLimitSettings` | `RateLimitSettings` |
| GET | `/api/v1/config/server` | — | `ServerSettings` |
| PUT | `/api/v1/config/server` | `ServerSettings` | `ServerSettings` |
| GET | `/api/v1/nts` | — | `NtsStatus` |
| POST | `/api/v1/nts/rotate-keys` | — | `NtsStatus` |
| GET | `/api/v1/refclocks` | — | `RefClockStatus[]` |
| GET | `/api/v1/events` | — | `ServerEvent[]` |

Every `PUT` returns the configuration **as the server actually applied it**, not
an echo of the request. The console replaces its form state with the response,
so a value the server clamped or normalized shows up immediately rather than
drifting out of sync.

`{address}` in the client eviction path is URL-encoded, so IPv6 addresses arrive
percent-escaped.

## Mapping to existing Rust types

Most of the contract already exists in the crate and needs only a serialization
layer:

| Wire type | Rust source |
|---|---|
| `MetricsSnapshot` | `ntp_server::server_common::MetricsSnapshot` — field-for-field |
| `AccessControlConfig` | `ntp_server::server_common::AccessControl` via `ConfigHandle::update` |
| `RateLimitConfig` | `ntp_server::server_common::RateLimitConfig` — `Duration` fields become integer milliseconds |
| `ClientEntry` | derived from `ClientTable` / `ClientState` |
| `ServerSettings` | the `NtpServerBuilder` options, read back from server state |
| `LeapIndicator` | `ntp_proto::protocol::LeapIndicator`, lowercased: `no_warning`, `add_one`, `sub_one`, `unknown` |
| `Timescale` | `ntp_proto::protocol::ntpv5::Timescale`, lowercased |
| `FixQuality` | `ntp_client::refclock::nmea::FixQuality`, lowercased |

Two deliberate translations:

- **Durations are integer milliseconds** (`window_duration_ms`, `min_interval_ms`).
  JSON has no duration type, and a `{secs, nanos}` object is awkward to bind to a
  form field.
- **Optional config is modelled explicitly.** `AccessControl.allow_list` is
  `null` when no allow list is enforced, matching `Option<Vec<IpNet>>`. The
  optionality of `RateLimitConfig` is carried by the separate `enabled` flag on
  `RateLimitSettings` rather than a nullable `config`, so turning rate limiting
  off does not discard the values the operator had configured.

## Which settings apply live

The console tells operators which changes need a restart, so the server should
behave accordingly:

- **Applied immediately** (the server holds these behind `Arc<RwLock<ServerConfig>>`
  and reads them per request): access control lists, rate limit settings,
  interleaved mode, and the clock identity fields.
- **Requires a restart**: `listen` and `v6only`, which are properties of the
  bound socket.

A `PUT` that changes a restart-only field should still persist it and succeed —
the console already warns the operator that it will not take effect until the
server rebinds.

## Errors

Non-2xx responses surface to the operator as-is, so the status code should carry
the meaning:

- `400` — validation failed (a malformed CIDR, an out-of-range stratum).
- `404` — unknown client address on eviction.
- `409` — the change conflicts with the running configuration.
- `503` — the server is reloading and cannot serve a consistent snapshot.

A JSON body of `{"message": "..."}` is useful but not currently read by the
console, which renders the status line.

## Notes for an implementation

- **`/api/v1/metrics/history` needs server-side retention.** `ServerMetrics` only
  holds cumulative atomics, so per-second rates have to be derived by sampling
  on an interval and keeping a ring buffer. The console expects samples oldest
  to newest at a consistent interval; it does not interpolate gaps.
- **Metrics are read with relaxed ordering.** A snapshot taken under load can be
  internally inconsistent by a few requests across counters. That is fine and
  the Metrics page says so.
- **Authentication is not specified here.** This API changes the configuration of
  a time service, so it should not be exposed unauthenticated. The console sends
  no credentials today; adding them means extending the `request()` helper in
  `src/api/client.ts` with whatever scheme the deployment uses.

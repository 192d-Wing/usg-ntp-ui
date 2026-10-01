# usg-ntp-ui

A web console for the [`ntp_usg`](https://github.com/192d-Wing/ntp_usg) Network
Time Protocol server, built with [Cloudscape](https://cloudscape.design/).

Monitor request throughput and the tracked client table, read the clock state the
server reports to clients, and change access control, rate limiting, and protocol
settings at runtime.

## Status: runs against simulated data

`ntp_usg` does not currently expose an HTTP management API. The data this console
shows — metrics, client table, runtime config — exists only in-process in the
`ntp_usg-server` crate, behind `ServerMetrics::snapshot()`, `ConfigHandle`, and
the `NtpServerBuilder`.

So the console ships with an in-memory simulation of a running server
([`src/api/mock/state.ts`](src/api/mock/state.ts)) and is wired to a typed API
contract that a future server-side implementation can satisfy. The contract is
specified in [`docs/API.md`](docs/API.md). Nothing outside
[`src/api/`](src/api/) knows which transport is active, so pointing the console
at a real server is a configuration change, not a rewrite.

The UI says so too: a banner on the dashboard and a **Demo data** badge in the
top navigation appear whenever no API is configured, so simulated numbers are
never mistaken for live ones.

## Getting started

```bash
npm install
npm run dev
```

The console is then at <http://localhost:5173> with the simulation driving it.

### Pointing it at a real server

Set `VITE_API_BASE_URL` to switch to the HTTP transport:

```bash
# .env.local
VITE_API_BASE_URL=https://ntp.example.mil
```

For a same-origin deployment, leave `VITE_API_BASE_URL` unset in production and
let a reverse proxy route `/api` to the server. In development, point the Vite
dev proxy at it instead, which avoids any CORS setup:

```bash
# .env.local
VITE_DEV_API_TARGET=http://localhost:8080
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Pages

### Monitoring

- **Dashboard** — service health, request throughput, clock state, listeners, recent events
- **Metrics** — every counter the server exposes, as charts and as an exact table
- **Clients** — the tracked client table, filterable by address, version, and state; evict entries
- **Events** — the server log, filterable by level and text

### Configuration

- **Server settings** — listen address, stratum, reference ID, precision, leap indicator, root delay and dispersion, interleaved mode, DSCP, NTPv5 timescale
- **Access control** — allow and deny lists in CIDR notation
- **Rate limiting** — per-client request budget, minimum interval, client table size

### Time sources

- **Reference clocks** — GPS, PPS, and local clock state, offset, and dispersion
- **NTS security** — NTS-KE listener, certificate expiry, AEAD algorithm, post-quantum key exchange, cookie key rotation

## Architecture

```text
src/
├── api/
│   ├── types.ts        Wire types mirroring the Rust structs
│   ├── client.ts       Transport selection: http | mock
│   ├── hooks.ts        useResource / useMutation / useNow
│   └── mock/state.ts   In-memory server simulation
├── components/
│   ├── AppShell.tsx    AppLayout, navigation, breadcrumbs, notifications
│   ├── charts.tsx      Throughput, rejection, and Kiss-o-Death charts
│   └── primitives.tsx  Stat tiles, status indicators, empty states
├── pages/              One file per page
└── utils/
    ├── format.ts       Counts, rates, sub-second durations, CIDR
    └── validation.ts   CIDR, socket address, and field validation
```

A few decisions worth knowing:

- **One transport boundary.** Every network call goes through `api` in
  `src/api/client.ts`. Pages never call `fetch`.
- **Forms seed from props on mount, not from an effect.** Each config page
  renders its form keyed on the resource version, so fresh server data remounts
  the form instead of being copied into state by an effect.
- **Validation is local and specific.** `utils/validation.ts` parses CIDR blocks
  and socket addresses so the operator gets a precise message immediately. The
  server is still expected to validate everything it receives.
- **Charts never share an axis across scales.** Throughput runs in the hundreds
  of requests per second while drops and Kiss-o-Death responses run in single
  digits, so they are separate charts rather than one chart with two y-axes.
  Series colors come from the Cloudscape categorical palette, so they stay
  consistent and keep working in dark mode.
- **Status is never color alone.** Health, fix quality, and log levels all render
  through `StatusIndicator`, which pairs a color with an icon and a text label.

## Verifying a change

```bash
npm run lint && npm run build
```

There is no test suite yet. Changes were verified by driving the running app in a
real browser: every route mounts with no console errors, and the form validation,
save, eviction, filter, help panel, dark mode, and navigation flows were
exercised end to end. Adding Playwright to make that repeatable is the obvious
next step.

## License

Apache-2.0, matching `ntp_usg`. See [LICENSE](LICENSE).

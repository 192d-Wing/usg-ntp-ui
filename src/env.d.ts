// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/// <reference types="vite/client" />

/** Build-time configuration, supplied through a `.env` file or the environment. */
interface ImportMetaEnv {
  /**
   * Base URL of the ntp_usg management API, for example `https://ntp.example.mil`
   * or an empty value to use the built-in simulation.
   *
   * Leave this unset for same-origin deployments and let the reverse proxy route
   * `/api` to the server.
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * Development only: address the Vite dev server proxies `/api` to, so the
   * console can talk to a local server without CORS configuration.
   */
  readonly VITE_DEV_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

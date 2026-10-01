// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // When VITE_API_BASE_URL is relative (the default deployment shape, where the
  // console is served from the same origin as the API), proxy /api to the
  // address in VITE_DEV_API_TARGET during development so there is no CORS setup
  // to do locally.
  const devApiTarget = env.VITE_DEV_API_TARGET;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: devApiTarget
        ? {
            '/api': {
              target: devApiTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Cloudscape is large and changes far less often than app code, so
          // giving the vendor code its own chunks keeps it cached across
          // deployments of the console itself.
          manualChunks(moduleId) {
            if (!moduleId.includes('node_modules')) {
              return undefined;
            }
            if (moduleId.includes('@cloudscape-design')) {
              return 'cloudscape';
            }
            if (/node_modules[/\\](react|react-dom|react-router|react-router-dom)[/\\]/.test(moduleId)) {
              return 'react';
            }
            return undefined;
          },
        },
      },
    },
  };
});

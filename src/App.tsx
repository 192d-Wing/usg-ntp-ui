// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Route table and the providers every page depends on. */

import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { HelpPanelProvider } from './components/HelpPanelProvider';
import { NotificationProvider } from './components/NotificationProvider';
import { AccessControl } from './pages/AccessControl';
import { Clients } from './pages/Clients';
import { Dashboard } from './pages/Dashboard';
import { Events } from './pages/Events';
import { Metrics } from './pages/Metrics';
import { NotFound } from './pages/NotFound';
import { NtsSecurity } from './pages/NtsSecurity';
import { RateLimiting } from './pages/RateLimiting';
import { RefClocks } from './pages/RefClocks';
import { ServerSettings } from './pages/ServerSettings';

export default function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <HelpPanelProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="metrics" element={<Metrics />} />
              <Route path="clients" element={<Clients />} />
              <Route path="events" element={<Events />} />
              <Route path="settings" element={<ServerSettings />} />
              <Route path="access-control" element={<AccessControl />} />
              <Route path="rate-limiting" element={<RateLimiting />} />
              <Route path="refclocks" element={<RefClocks />} />
              <Route path="nts" element={<NtsSecurity />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HelpPanelProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}

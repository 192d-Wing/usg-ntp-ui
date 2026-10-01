// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Cloudscape global styles must load before any component renders.
import '@cloudscape-design/global-styles/index.css';
import './index.css';

import App from './App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('The #root element is missing from index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Provider that lets a page contribute its own content to the AppLayout tools
 * drawer. A page calls `usePageHelp(<HelpPanel .../>)`; the shell renders it.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { HelpPanelContext } from './help-panel-context';

export function HelpPanelProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null);
  const [open, setOpen] = useState(false);

  const value = useMemo(() => ({ content, setContent, open, setOpen }), [content, open]);

  return <HelpPanelContext.Provider value={value}>{children}</HelpPanelContext.Provider>;
}

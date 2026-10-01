// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Context and hooks for the AppLayout tools drawer.
 *
 * Kept separate from the provider component so each module exports only
 * components or only non-components, which is what React Fast Refresh needs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';

export interface HelpPanelContextValue {
  content: ReactNode;
  setContent: (content: ReactNode) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const HelpPanelContext = createContext<HelpPanelContextValue | undefined>(undefined);

export function useHelpPanel(): HelpPanelContextValue {
  const context = useContext(HelpPanelContext);
  if (!context) {
    throw new Error('useHelpPanel must be used inside a HelpPanelProvider.');
  }
  return context;
}

/**
 * Register help content for as long as the calling page is mounted.
 *
 * The content is rebuilt on every render of the calling page, so this
 * intentionally depends only on the setter; the drawer clears on unmount.
 *
 * @param content The help panel to show in the tools drawer.
 */
export function usePageHelp(content: ReactNode): void {
  const { setContent } = useHelpPanel();

  useEffect(() => {
    setContent(content);
    return () => setContent(null);
    // The content is recreated each render by design; re-registering it on every
    // render would loop. Pages render static help, so the first value is correct.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [setContent]);
}

/** Returns a callback that opens the help drawer. Wire this to a Header `info` link. */
export function useOpenHelp(): () => void {
  const { setOpen } = useHelpPanel();
  return useCallback(() => setOpen(true), [setOpen]);
}

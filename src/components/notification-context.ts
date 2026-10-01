// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/**
 * Context and hook for app-wide notifications.
 *
 * Kept separate from the provider component so each module exports only
 * components or only non-components, which is what React Fast Refresh needs to
 * hot-reload a file instead of remounting the tree.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { FlashbarProps } from '@cloudscape-design/components/flashbar';

export type NotifyType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationContextValue {
  items: FlashbarProps.MessageDefinition[];
  /** Show a message. Successes dismiss themselves; errors persist. */
  notify: (type: NotifyType, content: ReactNode, header?: string) => void;
  dismissAll: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

/** Read the notification API. Throws if used outside the provider. */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside a NotificationProvider.');
  }
  return context;
}

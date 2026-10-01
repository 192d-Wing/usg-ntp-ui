// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Provider for the app-wide Flashbar notifications. */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { FlashbarProps } from '@cloudscape-design/components/flashbar';

import {
  NotificationContext,
  type NotifyType,
} from './notification-context';

/** How long a success message stays before dismissing itself. */
const SUCCESS_TIMEOUT_MS = 6000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (type: NotifyType, content: ReactNode, header?: string) => {
      const id = `flash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Newest first. The Flashbar stacks items and surfaces only the top one,
      // so appending would hide a fresh result behind an older, still-undismissed
      // error - the operator would act and appear to get no response.
      setItems((current) => [
        {
          id,
          type,
          header,
          content,
          dismissible: true,
          dismissLabel: 'Dismiss message',
          onDismiss: () => dismiss(id),
        },
        ...current,
      ]);

      // Successes are transient; errors stay until the operator dismisses them.
      if (type === 'success') {
        setTimeout(() => dismiss(id), SUCCESS_TIMEOUT_MS);
      }
    },
    [dismiss],
  );

  const dismissAll = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({ items, notify, dismissAll }), [items, notify, dismissAll]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

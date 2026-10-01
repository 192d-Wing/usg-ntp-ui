// Copyright 2026 U.S. Federal Government (in countries where recognized)
// SPDX-License-Identifier: Apache-2.0

/** Data fetching hooks shared by the pages. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './client';

/** What a page needs to render a loading, error, or loaded state. */
export interface Resource<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  /**
   * Increments every time `data` is replaced.
   *
   * Form pages use this as a React `key` so the form remounts and re-seeds its
   * fields from freshly loaded data, instead of copying props into state from
   * an effect.
   */
  version: number;
  /** Re-run the fetch. Shows the loading state again. */
  refresh: () => void;
  /** Replace the data locally, e.g. after a successful mutation. */
  setData: (next: T) => void;
}

/**
 * Fetch once on mount, and again whenever `refresh` is called or a poll fires.
 *
 * @param fetcher Must be stable across renders - wrap it in `useCallback` if it
 *   closes over anything.
 * @param pollMs When set, re-fetch on this interval without showing a spinner.
 */
export function useResource<T>(fetcher: () => Promise<T>, pollMs?: number): Resource<T> {
  const [state, setState] = useState<{ data: T | undefined; version: number }>({
    data: undefined,
    version: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  const replaceData = useCallback((next: T) => {
    setState((current) => ({ data: next, version: current.version + 1 }));
  }, []);

  // Guards against a slow response overwriting a newer one.
  const generation = useRef(0);

  const load = useCallback(
    async (showLoading: boolean) => {
      const current = generation.current + 1;
      generation.current = current;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const next = await fetcher();
        if (generation.current !== current) {
          return;
        }
        replaceData(next);
        setError(undefined);
      } catch (cause) {
        if (generation.current !== current) {
          return;
        }
        setError(
          cause instanceof ApiError || cause instanceof Error
            ? cause.message
            : 'The request failed for an unknown reason.',
        );
      } finally {
        if (generation.current === current) {
          setLoading(false);
        }
      }
    },
    [fetcher, replaceData],
  );

  useEffect(() => {
    // Fetching is the sanctioned use of an effect: it synchronizes React with an
    // external system. Starting the request necessarily flips the loading flag,
    // which is what the rule below would otherwise flag.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(true);
  }, [load, reloadToken]);

  useEffect(() => {
    if (!pollMs) {
      return;
    }
    const handle = setInterval(() => {
      void load(false);
    }, pollMs);
    return () => clearInterval(handle);
  }, [load, pollMs]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    data: state.data,
    version: state.version,
    loading,
    error,
    refresh,
    setData: replaceData,
  };
}

/**
 * A ticking clock, for views that show relative or elapsed time.
 *
 * Reading `Date.now()` during render makes the output depend on when React
 * happened to re-render. Holding the current time in state instead keeps render
 * pure and makes labels like "4s ago" actually count up.
 *
 * @param intervalMs How often to advance the clock.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);

  return now;
}

/**
 * Track an in-flight mutation so forms can disable their submit button and
 * surface failures without each page repeating the same try/catch.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  mutator: (...args: TArgs) => Promise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: string | undefined;
  clearError: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(undefined);
      try {
        return await mutator(...args);
      } catch (cause) {
        setError(
          cause instanceof ApiError || cause instanceof Error
            ? cause.message
            : 'The request failed for an unknown reason.',
        );
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [mutator],
  );

  const clearError = useCallback(() => setError(undefined), []);

  return { run, pending, error, clearError };
}

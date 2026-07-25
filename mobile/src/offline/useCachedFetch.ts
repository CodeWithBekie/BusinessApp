import { useCallback, useEffect, useState } from 'react';

import { getCached, setCached } from '@/src/offline/cache';

interface CachedFetchState<T> {
  data: T | null;
  error: string | null;
  refreshing: boolean;
  isFromCache: boolean;
  reload: (isRefresh?: boolean) => void;
}

// Drop-in replacement for the hand-rolled useState + .then(setX).catch(setError) pattern used
// across read screens — on fetch failure (e.g. offline), falls back to the last-cached value
// for this key instead of showing an error, so the screen still shows something useful.
export function useCachedFetch<T>(cacheKey: string, fetchFn: () => Promise<T>): CachedFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);

  // A different cache key means a different dataset (e.g. switching an order-status filter) —
  // clear stale data from the previous key rather than showing it while the new key loads.
  useEffect(() => {
    setData(null);
    setError(null);
    setIsFromCache(false);
  }, [cacheKey]);

  const reload = useCallback(
    (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      fetchFn()
        .then((result) => {
          setData(result);
          setError(null);
          setIsFromCache(false);
          void setCached(cacheKey, result);
        })
        .catch(async (err: Error) => {
          const cached = await getCached<T>(cacheKey);
          if (cached !== null) {
            setData(cached);
            setError(null);
            setIsFromCache(true);
          } else {
            setError(err.message);
          }
        })
        .finally(() => setRefreshing(false));
    },
    [cacheKey, fetchFn]
  );

  return { data, error, refreshing, isFromCache, reload };
}

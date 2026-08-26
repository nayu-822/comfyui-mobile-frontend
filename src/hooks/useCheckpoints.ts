import { useCallback, useEffect, useRef, useState } from 'react';
import { getCheckpoints } from '@/api/client';

export type CheckpointLoadStatus = 'loading' | 'loaded' | 'error';

export interface CheckpointState {
  checkpoints: string[];
  status: CheckpointLoadStatus;
  error: string | null;
  reload: () => void;
}

/** Load the server's current checkpoint registry for a model picker. */
export function useCheckpoints(enabled = true): CheckpointState {
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [status, setStatus] = useState<CheckpointLoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setError(null);
    // Starting from a resolved promise also turns a synchronous mock/runtime
    // failure into the same tracked error state as a rejected fetch.
    void Promise.resolve()
      .then(() => getCheckpoints())
      .then((items) => {
        if (currentRequest !== requestId.current) return;
        setCheckpoints(items);
        setStatus('loaded');
      })
      .catch((reason: unknown) => {
        if (currentRequest !== requestId.current) return;
        setError(reason instanceof Error ? reason.message : 'Failed to load checkpoints');
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Defer the initial request one microtask so mounting this hook does not
    // synchronously enqueue a state update from inside the effect itself.
    queueMicrotask(() => {
      if (!cancelled) reload();
    });
    return () => {
      cancelled = true;
      requestId.current += 1;
    };
  }, [enabled, reload]);

  return { checkpoints, status, error, reload };
}

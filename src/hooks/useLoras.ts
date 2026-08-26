import { useCallback, useEffect, useRef, useState } from 'react';
import { getLoras } from '@/api/client';

export type LoraLoadStatus = 'loading' | 'loaded' | 'error';

export interface LoraState {
  loras: string[];
  status: LoraLoadStatus;
  error: string | null;
  reload: () => void;
}

/** Load the server's current LoRA registry for the simple-generation picker. */
export function useLoras(enabled = true): LoraState {
  const [loras, setLoras] = useState<string[]>([]);
  const [status, setStatus] = useState<LoraLoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const reload = useCallback(() => {
    const currentRequest = ++requestId.current;
    setStatus('loading');
    setError(null);
    void Promise.resolve()
      .then(() => getLoras())
      .then((items) => {
        if (currentRequest !== requestId.current) return;
        setLoras(items);
        setStatus('loaded');
      })
      .catch((reason: unknown) => {
        if (currentRequest !== requestId.current) return;
        setError(reason instanceof Error ? reason.message : 'Failed to load LoRAs');
        setStatus('error');
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) reload();
    });
    return () => {
      cancelled = true;
      requestId.current += 1;
    };
  }, [enabled, reload]);

  return { loras, status, error, reload };
}

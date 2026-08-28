import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueue,
  deleteQueueItem,
  interruptExecution,
} from '../queue';

function response(ok: boolean): Response {
  return { ok } as Response;
}

describe('queue cancellation API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset().mockResolvedValue(response(true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a failed interrupt response', async () => {
    fetchMock.mockResolvedValue(response(false));

    await expect(interruptExecution()).rejects.toThrow('Failed to interrupt execution');
  });

  it('rejects a failed queue delete response', async () => {
    fetchMock.mockResolvedValue(response(false));

    await expect(deleteQueueItem('simple-prompt')).rejects.toThrow('Failed to delete queue item');
  });

  it('rejects a failed clear-queue response', async () => {
    fetchMock.mockResolvedValue(response(false));

    await expect(clearQueue()).rejects.toThrow('Failed to clear queue');
  });

  it('sends cancellation requests only to the requested endpoint/action', async () => {
    await deleteQueueItem('simple-prompt');
    expect(fetchMock).toHaveBeenCalledWith('/api/queue', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ delete: ['simple-prompt'] }),
    }));

    await interruptExecution();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/interrupt', { method: 'POST' });

    await clearQueue();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/queue', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ clear: true }),
    }));
  });
});

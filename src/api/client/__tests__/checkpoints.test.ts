import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCheckpoints } from '../checkpoints';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getCheckpoints', () => {
  it('loads the current checkpoint names from the mobile API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: ['models/a.safetensors', 'models/b.safetensors'] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(getCheckpoints()).resolves.toEqual([
      'models/a.safetensors',
      'models/b.safetensors',
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/mobile/api/checkpoints', { cache: 'no-store' });
  });

  it('surfaces the backend error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'checkpoint registry unavailable' }),
    } as Response));

    await expect(getCheckpoints()).rejects.toThrow('checkpoint registry unavailable');
  });

  it('rejects a malformed successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: 'not-an-array' }),
    } as Response));

    await expect(getCheckpoints()).rejects.toThrow('Invalid checkpoint list response');
  });
});

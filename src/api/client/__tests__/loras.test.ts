import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoras } from '../loras';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getLoras', () => {
  it('loads the current LoRA names from the mobile API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: ['styles/a.safetensors', 'styles/b.safetensors'] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(getLoras()).resolves.toEqual([
      'styles/a.safetensors',
      'styles/b.safetensors',
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/mobile/api/loras', { cache: 'no-store' });
  });

  it('surfaces the backend error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'LoRA registry unavailable' }),
    } as Response));

    await expect(getLoras()).rejects.toThrow('LoRA registry unavailable');
  });

  it('rejects a malformed successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: 'not-an-array' }),
    } as Response));

    await expect(getLoras()).rejects.toThrow('Invalid LoRA list response');
  });
});

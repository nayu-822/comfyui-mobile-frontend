import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLoras } from '@/api/client';
import { useLoras } from '../useLoras';

vi.mock('@/api/client', () => ({
  getLoras: vi.fn(),
}));

const getLorasMock = vi.mocked(getLoras);

function Probe({ enabled = true }: { enabled?: boolean }) {
  const state = useLoras(enabled);
  return (
    <div>
      <span data-status={state.status}>{state.loras.join('|')}</span>
      <span data-error={state.error ?? ''} />
      <button type="button" onClick={state.reload}>Reload</button>
    </div>
  );
}

describe('useLoras', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    getLorasMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('tracks loading and loaded states', async () => {
    let resolve: (value: string[]) => void = () => {};
    getLorasMock.mockReturnValue(new Promise((res) => { resolve = res; }));

    await act(async () => root.render(<Probe />));
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();

    await act(async () => resolve(['a.safetensors', 'b.safetensors']));
    expect(container.querySelector('[data-status="loaded"]')?.textContent).toBe('a.safetensors|b.safetensors');
  });

  it('tracks an error state', async () => {
    getLorasMock.mockRejectedValue(new Error('network down'));

    await act(async () => root.render(<Probe />));

    expect(container.querySelector('[data-status="error"]')).not.toBeNull();
    expect(container.querySelector('[data-error]')?.getAttribute('data-error')).toBe('network down');
  });

  it('does not load while disabled', async () => {
    await act(async () => root.render(<Probe enabled={false} />));

    expect(getLorasMock).not.toHaveBeenCalled();
  });
});

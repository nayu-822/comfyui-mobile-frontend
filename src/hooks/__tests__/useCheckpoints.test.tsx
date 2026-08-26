import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCheckpoints } from '@/api/client';
import { useCheckpoints } from '../useCheckpoints';

vi.mock('@/api/client', () => ({
  getCheckpoints: vi.fn(),
}));

const getCheckpointsMock = vi.mocked(getCheckpoints);

function Probe({ enabled = true }: { enabled?: boolean }) {
  const state = useCheckpoints(enabled);
  return (
    <div>
      <span data-status={state.status}>{state.checkpoints.join('|')}</span>
      <span data-error={state.error ?? ''} />
      <button type="button" onClick={state.reload}>Reload</button>
    </div>
  );
}

describe('useCheckpoints', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    getCheckpointsMock.mockReset();
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
    getCheckpointsMock.mockReturnValue(new Promise((res) => { resolve = res; }));

    await act(async () => root.render(<Probe />));
    expect(container.querySelector('[data-status="loading"]')).not.toBeNull();

    await act(async () => resolve(['a.safetensors', 'b.safetensors']));
    expect(container.querySelector('[data-status="loaded"]')?.textContent).toBe('a.safetensors|b.safetensors');
  });

  it('tracks an error state', async () => {
    getCheckpointsMock.mockRejectedValue(new Error('network down'));

    await act(async () => root.render(<Probe />));

    expect(container.querySelector('[data-status="error"]')).not.toBeNull();
    expect(container.querySelector('[data-error]')?.getAttribute('data-error')).toBe('network down');
  });

  it('does not load while disabled', async () => {
    await act(async () => root.render(<Probe enabled={false} />));

    expect(getCheckpointsMock).not.toHaveBeenCalled();
  });
});

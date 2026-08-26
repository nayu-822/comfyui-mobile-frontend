import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import { BasicSettings } from '../BasicSettings';

const props = {
  checkpoints: ['models/a.safetensors', 'models/b.safetensors'],
  checkpointsStatus: 'loaded' as const,
  checkpointError: null,
  onReloadCheckpoints: () => {},
};

describe('BasicSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGenerationForm.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders a checkpoint select and disables the seed value in random mode', async () => {
    await act(async () => root.render(<BasicSettings {...props} />));

    const select = container.querySelector('select[aria-label="Checkpoint"]') as HTMLSelectElement | null;
    const seed = container.querySelector('input[aria-label="Seed value"]') as HTMLInputElement | null;
    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((option) => option.value)).toEqual([
      'PUT_CHECKPOINT_HERE.safetensors',
      'models/a.safetensors',
      'models/b.safetensors',
    ]);
    expect(seed?.disabled).toBe(true);

    const fixed = container.querySelector('input[type="radio"][value="fixed"]') as HTMLInputElement | null;
    await act(async () => fixed?.click());

    expect(useGenerationForm.getState().seedMode).toBe('fixed');
    expect(seed?.disabled).toBe(false);
  });

  it('keeps a restored checkpoint as a visible not-detected option', async () => {
    useGenerationForm.getState().patch({ checkpoint: 'restored/missing.safetensors' });

    await act(async () => root.render(<BasicSettings {...props} />));

    const select = container.querySelector('select[aria-label="Checkpoint"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('restored/missing.safetensors');
    expect(Array.from(select?.options ?? []).some((option) =>
      option.textContent?.includes('Restored model (not detected): restored/missing.safetensors'))).toBe(true);
    expect(useGenerationForm.getState().checkpoint).toBe('restored/missing.safetensors');
  });
});

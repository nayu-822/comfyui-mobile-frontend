import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationForm, type LoraSlots } from '@/hooks/useGenerationForm';
import { BasicSettings } from '../BasicSettings';

const props = {
  checkpoints: ['models/a.safetensors', 'models/b.safetensors'],
  checkpointsStatus: 'loaded' as const,
  checkpointError: null,
  onReloadCheckpoints: () => {},
  onCheckpointChangedByUser: () => {},
  loras: ['models/style.safetensors', 'models/other.safetensors'],
  lorasStatus: 'loaded' as const,
  loraError: null,
  onReloadLoras: () => {},
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

    const seedMode = container.querySelector('select[aria-label="Seed mode"]') as HTMLSelectElement | null;
    await act(async () => {
      if (!seedMode) throw new Error('Seed mode select was not rendered.');
      seedMode.value = 'fixed';
      seedMode.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGenerationForm.getState().seedMode).toBe('fixed');
    expect(seed?.disabled).toBe(false);
  });

  it('renders LoRA model selects and updates the selected model', async () => {
    await act(async () => root.render(<BasicSettings {...props} />));

    const select = container.querySelector('select[aria-label="LoRA 1 model"]') as HTMLSelectElement | null;
    expect(select).not.toBeNull();
    expect(Array.from(select?.options ?? []).map((option) => option.value)).toEqual([
      'PUT_LORA_1_HERE.safetensors',
      '',
      'models/style.safetensors',
      'models/other.safetensors',
    ]);

    await act(async () => {
      if (!select) throw new Error('LoRA model select was not rendered.');
      select.value = 'models/style.safetensors';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGenerationForm.getState().loras[0].name).toBe('models/style.safetensors');
  });

  it('keeps a restored LoRA as a visible not-detected option', async () => {
    useGenerationForm.getState().patch({
      loras: [
        { enabled: true, name: 'restored/missing.safetensors', strengthModel: 1, strengthClip: 1 },
        ...useGenerationForm.getState().loras.slice(1),
      ] as LoraSlots,
    });

    await act(async () => root.render(<BasicSettings {...props} />));

    const select = container.querySelector('select[aria-label="LoRA 1 model"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('restored/missing.safetensors');
    expect(Array.from(select?.options ?? []).some((option) =>
      option.textContent?.includes('Restored model (not detected): restored/missing.safetensors'))).toBe(true);
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

  it('notifies the parent when the user changes the checkpoint', async () => {
    const onCheckpointChangedByUser = vi.fn();

    await act(async () => root.render(
      <BasicSettings {...props} onCheckpointChangedByUser={onCheckpointChangedByUser} />,
    ));

    const select = container.querySelector('select[aria-label="Checkpoint"]') as HTMLSelectElement | null;
    await act(async () => {
      if (!select) throw new Error('Checkpoint select was not rendered.');
      select.value = 'models/b.safetensors';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onCheckpointChangedByUser).toHaveBeenCalledTimes(1);
    expect(useGenerationForm.getState().checkpoint).toBe('models/b.safetensors');
  });
});

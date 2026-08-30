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

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

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

  it('keeps Width and Height empty while editing and falls back to their minimum on blur', async () => {
    await act(async () => root.render(<BasicSettings {...props} />));

    const width = container.querySelector('input[aria-label="Width"]') as HTMLInputElement | null;
    const height = container.querySelector('input[aria-label="Height"]') as HTMLInputElement | null;
    if (!width || !height) throw new Error('Width and Height inputs were not rendered.');

    await act(async () => {
      width.focus();
      setInputValue(width, '');
    });
    expect(width.value).toBe('');

    await act(async () => width.blur());
    expect(width.value).toBe('64');

    await act(async () => {
      height.focus();
      setInputValue(height, '');
    });
    expect(height.value).toBe('');

    await act(async () => height.blur());
    expect(height.value).toBe('64');
    expect(useGenerationForm.getState().width).toBe(64);
    expect(useGenerationForm.getState().height).toBe(64);
  });

  it('allows LoRA strength to be empty while editing and restores the default on blur', async () => {
    useGenerationForm.getState().setLora(0, {
      enabled: true,
      strengthModel: 0.75,
      strengthClip: 0.75,
    });
    await act(async () => root.render(<BasicSettings {...props} />));

    const strength = container.querySelector('input[aria-label="LoRA 1 Strength"]') as HTMLInputElement | null;
    if (!strength) throw new Error('LoRA strength input was not rendered.');

    await act(async () => {
      strength.focus();
      setInputValue(strength, '');
    });
    expect(strength.value).toBe('');

    await act(async () => strength.blur());
    expect(strength.value).toBe('1');
    expect(useGenerationForm.getState().loras[0].strengthModel).toBe(1);
    expect(useGenerationForm.getState().loras[0].strengthClip).toBe(1);
  });

  it('keeps Seed empty while editing and restores zero on blur', async () => {
    useGenerationForm.getState().patch({ seedMode: 'fixed', seed: 123 });
    await act(async () => root.render(<BasicSettings {...props} />));

    const seed = container.querySelector('input[aria-label="Seed value"]') as HTMLInputElement | null;
    if (!seed) throw new Error('Seed input was not rendered.');

    await act(async () => {
      seed.focus();
      setInputValue(seed, '');
    });
    expect(seed.value).toBe('');

    await act(async () => seed.blur());
    expect(seed.value).toBe('0');
    expect(useGenerationForm.getState().seed).toBe(0);
  });

  it('syncs a restored external Width value when the field is not being edited', async () => {
    await act(async () => root.render(<BasicSettings {...props} />));

    const width = container.querySelector('input[aria-label="Width"]') as HTMLInputElement | null;
    if (!width) throw new Error('Width input was not rendered.');

    await act(async () => useGenerationForm.getState().patch({ width: 640 }));
    expect(width.value).toBe('640');
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

  it('keeps the LoRA section closed initially and shows the enabled count', async () => {
    useGenerationForm.getState().patch({
      loras: [
        { enabled: true, name: 'models/style.safetensors', strengthModel: 1, strengthClip: 1 },
        { enabled: true, name: 'models/other.safetensors', strengthModel: 1, strengthClip: 1 },
        ...useGenerationForm.getState().loras.slice(2),
      ] as LoraSlots,
    });

    await act(async () => root.render(<BasicSettings {...props} />));

    const details = container.querySelector('[data-testid="lora-settings"]') as HTMLDetailsElement | null;
    expect(details?.open).toBe(false);
    expect(details?.querySelector('summary')?.textContent).toContain('LoRA');
    expect(details?.querySelector('summary')?.textContent).toContain('2 enabled');
  });

  it('preserves LoRA ON/OFF controls inside the collapsed section', async () => {
    await act(async () => root.render(<BasicSettings {...props} />));

    const toggles = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    expect(toggles).toHaveLength(3);
    expect(toggles[0]?.checked).toBe(false);

    await act(async () => toggles[0]?.click());

    expect(useGenerationForm.getState().loras[0].enabled).toBe(true);
    expect(container.querySelector('[data-testid="lora-settings"] summary')?.textContent)
      .toContain('1 enabled');
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

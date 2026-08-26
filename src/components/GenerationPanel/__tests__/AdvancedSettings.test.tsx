import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import { AdvancedSettings } from '../AdvancedSettings';

describe('AdvancedSettings Hires controls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGenerationForm.getState().reset();
    useGenerationForm.getState().patch({ hiresEnabled: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows the Hires method and conditionally shows resize options', async () => {
    await act(async () => root.render(<AdvancedSettings />));

    const hiresMethod = container.querySelector('select[aria-label="Hires method"]') as HTMLSelectElement | null;
    expect(hiresMethod?.value).toBe('latent');
    expect(container.querySelector('select[aria-label="Resize method"]')).toBeNull();

    await act(async () => {
      if (!hiresMethod) throw new Error('Hires method select was not rendered.');
      hiresMethod.value = 'resize';
      hiresMethod.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGenerationForm.getState().hiresMode).toBe('resize');
    const resizeMethod = container.querySelector('select[aria-label="Resize method"]') as HTMLSelectElement | null;
    expect(resizeMethod?.value).toBe('lanczos');
    expect(Array.from(resizeMethod?.options ?? []).map((option) => option.value)).toEqual([
      'lanczos',
      'bicubic',
      'bilinear',
      'nearest-exact',
    ]);
  });
});

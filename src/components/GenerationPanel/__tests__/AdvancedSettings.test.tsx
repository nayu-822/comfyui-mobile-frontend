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

  it('uses dropdowns for base and Hires sampler and scheduler settings', async () => {
    await act(async () => root.render(<AdvancedSettings />));

    const baseSampler = container.querySelector('select[aria-label="Base sampler"]') as HTMLSelectElement | null;
    const baseScheduler = container.querySelector('select[aria-label="Base scheduler"]') as HTMLSelectElement | null;
    const hiresSampler = container.querySelector('select[aria-label="Hires sampler"]') as HTMLSelectElement | null;
    const hiresScheduler = container.querySelector('select[aria-label="Hires scheduler"]') as HTMLSelectElement | null;
    expect(baseSampler?.value).toBe('euler_ancestral');
    expect(baseScheduler?.value).toBe('normal');
    expect(hiresSampler?.value).toBe('euler_ancestral');
    expect(hiresScheduler?.value).toBe('normal');
    expect(Array.from(baseSampler?.options ?? []).map((option) => option.value)).toContain('euler_ancestral');
    expect(Array.from(baseScheduler?.options ?? []).map((option) => option.value)).toContain('karras');

    await act(async () => {
      if (!baseSampler || !baseScheduler || !hiresSampler || !hiresScheduler) {
        throw new Error('Sampler and scheduler selects were not rendered.');
      }
      baseSampler.value = 'dpmpp_2m';
      baseSampler.dispatchEvent(new Event('change', { bubbles: true }));
      baseScheduler.value = 'karras';
      baseScheduler.dispatchEvent(new Event('change', { bubbles: true }));
      hiresSampler.value = 'euler';
      hiresSampler.dispatchEvent(new Event('change', { bubbles: true }));
      hiresScheduler.value = 'simple';
      hiresScheduler.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(useGenerationForm.getState().sampler).toBe('dpmpp_2m');
    expect(useGenerationForm.getState().scheduler).toBe('karras');
    expect(useGenerationForm.getState().hiresSampler).toBe('euler');
    expect(useGenerationForm.getState().hiresScheduler).toBe('simple');
  });
});

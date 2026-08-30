import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NodeTypes } from '@/api/types';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import { AdvancedSettings } from '../AdvancedSettings';

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

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

  it('keeps Sampling Steps empty while editing, accepts a new value, and falls back on blur', async () => {
    await act(async () => root.render(<AdvancedSettings />));

    const steps = container.querySelector('input[aria-label="Sampling Steps"]') as HTMLInputElement | null;
    if (!steps) throw new Error('Sampling Steps input was not rendered.');

    await act(async () => {
      steps.focus();
      setInputValue(steps, '');
    });
    expect(steps.value).toBe('');

    await act(async () => setInputValue(steps, '35'));
    expect(steps.value).toBe('35');
    expect(useGenerationForm.getState().steps).toBe(35);

    await act(async () => {
      setInputValue(steps, '');
      steps.blur();
    });
    expect(steps.value).toBe('1');
    expect(useGenerationForm.getState().steps).toBe(1);
  });

  it('keeps zero-minimum CFG empty until blur, then restores zero', async () => {
    await act(async () => root.render(<AdvancedSettings />));

    const cfg = container.querySelector('input[aria-label="Sampling CFG"]') as HTMLInputElement | null;
    if (!cfg) throw new Error('Sampling CFG input was not rendered.');

    await act(async () => {
      cfg.focus();
      setInputValue(cfg, '');
    });
    expect(cfg.value).toBe('');
    expect(cfg.value).not.toBe('0');

    await act(async () => cfg.blur());
    expect(cfg.value).toBe('0');
    expect(useGenerationForm.getState().cfg).toBe(0);
  });

  it('keeps Hires Denoise and FaceDetailer CFG empty while editing', async () => {
    useGenerationForm.getState().patch({ faceDetailerEnabled: true });
    await act(async () => root.render(<AdvancedSettings />));

    const hiresDenoise = container.querySelector('input[aria-label="Hires Denoise"]') as HTMLInputElement | null;
    const faceCfg = container.querySelector('input[aria-label="FaceDetailer CFG"]') as HTMLInputElement | null;
    if (!hiresDenoise || !faceCfg) throw new Error('Advanced numeric inputs were not rendered.');

    await act(async () => {
      hiresDenoise.focus();
      setInputValue(hiresDenoise, '');
    });
    expect(hiresDenoise.value).toBe('');
    expect(hiresDenoise.value).not.toBe('0');

    await act(async () => {
      faceCfg.focus();
      setInputValue(faceCfg, '');
    });
    expect(faceCfg.value).toBe('');
    expect(faceCfg.value).not.toBe('0');
  });

  it('syncs a restored external Steps value when the field is not being edited', async () => {
    await act(async () => root.render(<AdvancedSettings />));

    const steps = container.querySelector('input[aria-label="Sampling Steps"]') as HTMLInputElement | null;
    if (!steps) throw new Error('Sampling Steps input was not rendered.');

    await act(async () => useGenerationForm.getState().patch({ steps: 42 }));
    expect(steps.value).toBe('42');
  });

  it('does not overwrite a focused numeric draft during an external update', async () => {
    await act(async () => root.render(<AdvancedSettings />));

    const steps = container.querySelector('input[aria-label="Sampling Steps"]') as HTMLInputElement | null;
    if (!steps) throw new Error('Sampling Steps input was not rendered.');

    await act(async () => {
      steps.focus();
      setInputValue(steps, '');
    });
    await act(async () => useGenerationForm.getState().patch({ steps: 42 }));
    expect(steps.value).toBe('');

    await act(async () => steps.blur());
    expect(steps.value).toBe('1');
  });

  it('renders FaceDetailer prompt textareas above its numeric settings', async () => {
    useGenerationForm.getState().patch({ faceDetailerEnabled: true });
    await act(async () => root.render(<AdvancedSettings />));

    const positive = container.querySelector('textarea[placeholder="Use main positive prompt"]') as HTMLTextAreaElement | null;
    const negative = container.querySelector('textarea[placeholder="Use main negative prompt"]') as HTMLTextAreaElement | null;
    expect(positive).not.toBeNull();
    expect(negative).not.toBeNull();
    expect(positive?.rows).toBe(2);
    expect(negative?.rows).toBe(2);

    await act(async () => {
      if (!positive || !negative) throw new Error('Face prompt textareas were not rendered.');
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      valueSetter?.call(positive, 'face positive');
      positive.dispatchEvent(new Event('input', { bubbles: true }));
      valueSetter?.call(negative, 'face negative');
      negative.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(useGenerationForm.getState().facePositivePrompt).toBe('face positive');
    expect(useGenerationForm.getState().faceNegativePrompt).toBe('face negative');
  });

  it('uses runtime UpscaleModelLoader choices and preserves a missing restored model', async () => {
    const nodeTypes = {
      UpscaleModelLoader: {
        input: {
          required: {
            model_name: ['COMBO', {
              multiselect: false,
              options: ['4x-UltraSharp.pth', '4x-AnimeSharp.pth'],
            }],
          },
        },
      },
    } as unknown as NodeTypes;
    useGenerationForm.getState().patch({
      upscaleEnabled: true,
      upscaleModel: 'restored/missing-upscaler.pth',
    });

    await act(async () => root.render(<AdvancedSettings nodeTypes={nodeTypes} />));

    const select = container.querySelector('select[aria-label="Upscale Model"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('restored/missing-upscaler.pth');
    expect(Array.from(select?.options ?? []).map((option) => option.value)).toEqual([
      'restored/missing-upscaler.pth',
      '4x-UltraSharp.pth',
      '4x-AnimeSharp.pth',
    ]);
    expect(select?.options[0]?.textContent).toBe(
      'Restored model (not detected): restored/missing-upscaler.pth',
    );

    await act(async () => {
      if (!select) throw new Error('Upscale model select was not rendered.');
      select.value = '4x-AnimeSharp.pth';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useGenerationForm.getState().upscaleModel).toBe('4x-AnimeSharp.pth');
  });

  it('does not mark a restored model as missing when the current runtime combo lists it', async () => {
    const nodeTypes = {
      UpscaleModelLoader: {
        input: {
          required: {
            model_name: ['COMBO', {
              multiselect: false,
              options: ['4x-UltraSharp.pth', '4x-AnimeSharp.pth'],
            }],
          },
        },
      },
    } as unknown as NodeTypes;
    useGenerationForm.getState().patch({
      upscaleEnabled: true,
      upscaleModel: '4x-UltraSharp.pth',
    });

    await act(async () => root.render(<AdvancedSettings nodeTypes={nodeTypes} />));

    const select = container.querySelector('select[aria-label="Upscale Model"]') as HTMLSelectElement | null;
    expect(select?.value).toBe('4x-UltraSharp.pth');
    expect(Array.from(select?.options ?? []).map((option) => option.textContent)).toEqual([
      '4x-UltraSharp.pth',
      '4x-AnimeSharp.pth',
    ]);
    expect(Array.from(select?.options ?? []).some((option) => option.textContent?.includes('Restored model'))).toBe(false);
  });

  it('keeps the Upscale Model control disabled while Upscaler is off', async () => {
    await act(async () => root.render(<AdvancedSettings nodeTypes={null} />));
    const select = container.querySelector('select[aria-label="Upscale Model"]') as HTMLSelectElement | null;
    expect(select?.disabled).toBe(true);
  });
});

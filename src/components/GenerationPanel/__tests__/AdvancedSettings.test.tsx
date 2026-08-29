import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NodeTypes } from '@/api/types';
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
            model_name: [['4x-UltraSharp.pth', '4x-AnimeSharp.pth']],
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

  it('keeps the Upscale Model control disabled while Upscaler is off', async () => {
    await act(async () => root.render(<AdvancedSettings nodeTypes={null} />));
    const select = container.querySelector('select[aria-label="Upscale Model"]') as HTMLSelectElement | null;
    expect(select?.disabled).toBe(true);
  });
});

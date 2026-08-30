import { describe, expect, it } from 'vitest';
import type { NodeTypes } from '@/api/types';
import {
  extractComboOptions,
  getSamplerOptions,
  getSchedulerOptions,
  getUpscaleModelOptions,
} from '../generationOptions';

const nodeTypes = {
  KSampler: {
    input: {
      required: {
        sampler_name: ['COMBO', { options: ['server_sampler'] }],
        scheduler: ['COMBO', { options: ['server_scheduler'] }],
      },
    },
  },
} as unknown as NodeTypes;

describe('generation options', () => {
  it('extracts and normalizes legacy and current combo definitions', () => {
    expect(extractComboOptions([['legacy_a', 'legacy_b', 'legacy_a']])).toEqual([
      'legacy_a',
      'legacy_b',
    ]);
    expect(extractComboOptions(['COMBO', {
      multiselect: false,
      options: ['current_a', 'current_b', 'current_a'],
    }])).toEqual(['current_a', 'current_b']);
  });

  it('ignores invalid combo values and malformed object_info shapes safely', () => {
    expect(extractComboOptions(['COMBO', {
      options: ['valid', 42, null, '', 'valid', { value: 'invalid' }, 'also-valid'],
    }])).toEqual(['valid', 'also-valid']);
    expect(extractComboOptions(null)).toEqual([]);
    expect(extractComboOptions(['STRING', { multiline: true }])).toEqual([]);
    expect(extractComboOptions(['COMBO', { options: 'not-an-array' }])).toEqual([]);
  });

  it('uses live KSampler combo options and preserves an unlisted restored value', () => {
    expect(getSamplerOptions(nodeTypes, 'server_sampler')).toEqual(['server_sampler']);
    expect(getSchedulerOptions(nodeTypes, 'restored_scheduler')).toEqual([
      'server_scheduler',
      'restored_scheduler',
    ]);
  });

  it('falls back to standard ComfyUI choices while node definitions load', () => {
    expect(getSamplerOptions(null, 'euler_ancestral')).toContain('euler_ancestral');
    expect(getSchedulerOptions(null, 'normal')).toContain('normal');
  });

  it('reads the runtime UpscaleModelLoader model combo without adding a fallback list', () => {
    const types = {
      UpscaleModelLoader: {
        input: {
          required: {
            model_name: ['COMBO', {
              multiselect: false,
              options: ['4x-UltraSharp.pth', 'RealESRGAN_x4plus.pth', '4x-UltraSharp.pth'],
            }],
          },
        },
      },
    } as unknown as NodeTypes;

    expect(getUpscaleModelOptions(types)).toEqual([
      '4x-UltraSharp.pth',
      'RealESRGAN_x4plus.pth',
    ]);
    expect(getUpscaleModelOptions(null)).toEqual([]);
  });
});

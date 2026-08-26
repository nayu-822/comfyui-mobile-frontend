import { describe, expect, it } from 'vitest';
import type { NodeTypes } from '@/api/types';
import { getSamplerOptions, getSchedulerOptions } from '../generationOptions';

const nodeTypes = {
  KSampler: {
    input: {
      required: {
        sampler_name: [['server_sampler']],
        scheduler: [['server_scheduler']],
      },
    },
  },
} as unknown as NodeTypes;

describe('generation options', () => {
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
});

import { describe, expect, it } from 'vitest';
import type { Workflow, WorkflowLink, WorkflowNode } from '@/api/types';
import mobileSdxlWorkflowAsset from '@/workflows/mobile_sdxl_default.json';

const workflow = mobileSdxlWorkflowAsset as unknown as Workflow;

function nodeByTitle(title: string): WorkflowNode {
  const node = workflow.nodes.find((candidate) => candidate.title === title);
  if (!node) throw new Error(`Missing ${title}`);
  return node;
}

function linkById(id: number): WorkflowLink {
  const link = workflow.links.find((candidate) => candidate[0] === id);
  if (!link) throw new Error(`Missing link ${id}`);
  return link;
}

describe('mobile_sdxl_default workflow', () => {
  it('contains executable latent and image-resize Hires branches without frontend-only switches', () => {
    expect(workflow.last_node_id).toBe(20);
    expect(workflow.last_link_id).toBe(42);

    expect(nodeByTitle('MOBILE_HIRES_UPSCALE').type).toBe('LatentUpscaleBy');
    expect(nodeByTitle('MOBILE_HIRES_SAMPLER').type).toBe('KSampler');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_DECODE').type).toBe('VAEDecode');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_IMAGE').type).toBe('ImageScaleBy');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_ENCODE').type).toBe('VAEEncode');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_SAMPLER').type).toBe('KSampler');

    expect(workflow.nodes.some((node) => node.type === 'ComfySwitchNode')).toBe(false);
    expect((nodeByTitle('MOBILE_HIRES_RESIZE_IMAGE').widgets_values as unknown[])[0]).toBe('lanczos');

    expect(linkById(30)).toEqual([30, 8, 0, 17, 0, 'LATENT']);
    expect(linkById(31)).toEqual([31, 1, 2, 17, 1, 'VAE']);
    expect(linkById(32)).toEqual([32, 17, 0, 18, 0, 'IMAGE']);
    expect(linkById(33)).toEqual([33, 18, 0, 19, 0, 'IMAGE']);
    expect(linkById(34)).toEqual([34, 1, 2, 19, 1, 'VAE']);
    expect(linkById(38)).toEqual([38, 19, 0, 20, 3, 'LATENT']);
    expect(linkById(42)).toEqual([42, 8, 0, 11, 0, 'LATENT']);
    expect(nodeByTitle('MOBILE_BASE_SAMPLER').outputs[0]?.links).toContain(42);
    expect(nodeByTitle('MOBILE_HIRES_SAMPLER').outputs[0]?.links).toEqual([]);
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_SAMPLER').outputs[0]?.links).toEqual([]);
    expect(nodeByTitle('MOBILE_VAE_DECODE').inputs[0]?.link).toBe(42);
  });
});

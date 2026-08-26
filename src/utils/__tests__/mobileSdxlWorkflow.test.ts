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
  it('contains latent and image-resize Hires branches with explicit selection', () => {
    expect(workflow.last_node_id).toBe(22);
    expect(workflow.last_link_id).toBe(42);

    expect(nodeByTitle('MOBILE_HIRES_UPSCALE').type).toBe('LatentUpscaleBy');
    expect(nodeByTitle('MOBILE_HIRES_SAMPLER').type).toBe('KSampler');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_DECODE').type).toBe('VAEDecode');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_IMAGE').type).toBe('ImageScaleBy');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_ENCODE').type).toBe('VAEEncode');
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_SAMPLER').type).toBe('KSampler');
    expect(nodeByTitle('MOBILE_HIRES_MODE').type).toBe('ComfySwitchNode');
    expect(nodeByTitle('MOBILE_HIRES_RESULT_SELECT').type).toBe('ComfySwitchNode');

    expect((nodeByTitle('MOBILE_HIRES_RESIZE_IMAGE').widgets_values as unknown[])[0]).toBe('lanczos');
    expect((nodeByTitle('MOBILE_HIRES_MODE').widgets_values as unknown[])[0]).toBe(false);
    expect((nodeByTitle('MOBILE_HIRES_RESULT_SELECT').widgets_values as unknown[])[0]).toBe(false);

    expect(linkById(30)).toEqual([30, 8, 0, 17, 0, 'LATENT']);
    expect(linkById(31)).toEqual([31, 1, 2, 17, 1, 'VAE']);
    expect(linkById(32)).toEqual([32, 17, 0, 18, 0, 'IMAGE']);
    expect(linkById(33)).toEqual([33, 18, 0, 19, 0, 'IMAGE']);
    expect(linkById(34)).toEqual([34, 1, 2, 19, 1, 'VAE']);
    expect(linkById(38)).toEqual([38, 19, 0, 20, 3, 'LATENT']);
    expect(linkById(39)).toEqual([39, 20, 0, 21, 1, 'LATENT']);

    const modeSwitch = nodeByTitle('MOBILE_HIRES_MODE');
    expect(modeSwitch.inputs[0]?.link).toBe(18);
    expect(modeSwitch.inputs[1]?.link).toBe(39);

    const resultSwitch = nodeByTitle('MOBILE_HIRES_RESULT_SELECT');
    expect(resultSwitch.inputs[0]?.link).toBe(41);
    expect(resultSwitch.inputs[1]?.link).toBe(40);
    expect(nodeByTitle('MOBILE_VAE_DECODE').inputs[0]?.link).toBe(42);
  });
});

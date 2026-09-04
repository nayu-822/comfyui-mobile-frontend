import { describe, expect, it } from 'vitest';
import type { Workflow, WorkflowLink, WorkflowNode } from '@/api/types';
import mobileSdxlWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import mobileAnimaWorkflowAsset from '@/workflows/mobile_anima_default.json';

const workflow = mobileSdxlWorkflowAsset as unknown as Workflow;
const animaWorkflow = mobileAnimaWorkflowAsset as unknown as Workflow;

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

function animaNodeByTitle(title: string): WorkflowNode {
  const node = animaWorkflow.nodes.find((candidate) => candidate.title === title);
  if (!node) throw new Error(`Missing Anima ${title}`);
  return node;
}

function animaLinkById(id: number): WorkflowLink {
  const link = animaWorkflow.links.find((candidate) => candidate[0] === id);
  if (!link) throw new Error(`Missing Anima link ${id}`);
  return link;
}

describe('mobile_sdxl_default workflow', () => {
  it('contains executable latent and image-resize Hires branches without frontend-only switches', () => {
    expect(workflow.last_node_id).toBe(22);
    expect(workflow.last_link_id).toBe(46);

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
    expect(linkById(43)).toEqual([43, 4, 1, 21, 0, 'CLIP']);
    expect(linkById(44)).toEqual([44, 4, 1, 22, 0, 'CLIP']);
    expect(linkById(45)).toEqual([45, 21, 0, 13, 4, 'CONDITIONING']);
    expect(linkById(46)).toEqual([46, 22, 0, 13, 5, 'CONDITIONING']);
    expect(nodeByTitle('MOBILE_FACE_POSITIVE').type).toBe('CLIPTextEncode');
    expect(nodeByTitle('MOBILE_FACE_NEGATIVE').type).toBe('CLIPTextEncode');
    expect(nodeByTitle('MOBILE_FACE_POSITIVE').inputs[0]?.link).toBe(43);
    expect(nodeByTitle('MOBILE_FACE_NEGATIVE').inputs[0]?.link).toBe(44);
    expect(nodeByTitle('MOBILE_FACE_DETAILER').inputs[4]?.link).toBe(45);
    expect(nodeByTitle('MOBILE_FACE_DETAILER').inputs[5]?.link).toBe(46);
    expect(nodeByTitle('MOBILE_BASE_SAMPLER').outputs[0]?.links).toContain(42);
    expect(nodeByTitle('MOBILE_HIRES_SAMPLER').outputs[0]?.links).toEqual([]);
    expect(nodeByTitle('MOBILE_HIRES_RESIZE_SAMPLER').outputs[0]?.links).toEqual([]);
    expect(nodeByTitle('MOBILE_VAE_DECODE').inputs[0]?.link).toBe(42);
  });
});

describe('mobile_anima_default workflow', () => {
  it('uses the native split-file Anima architecture and keeps the shared feature graph', () => {
    expect(animaWorkflow.extra).toMatchObject({
      mobile_generation_profile: { workflowKind: 'anima' },
    });
    const checkpointWidgets = animaNodeByTitle('MOBILE_CHECKPOINT').widgets_values;
    expect(Array.isArray(checkpointWidgets) ? checkpointWidgets[0] : undefined)
      .toBe('anima-base-v1.0.safetensors');

    expect(animaNodeByTitle('MOBILE_CHECKPOINT').type).toBe('UNETLoader');
    expect(animaNodeByTitle('MOBILE_TEXT_ENCODER').type).toBe('CLIPLoader');
    expect(animaNodeByTitle('MOBILE_VAE_LOADER').type).toBe('VAELoader');
    expect(animaWorkflow.nodes.some((node) => node.type === 'CheckpointLoaderSimple')).toBe(false);
    expect(animaWorkflow.nodes.some((node) => node.type === 'CheckpointLoader')).toBe(false);

    const textEncoderWidgets = animaNodeByTitle('MOBILE_TEXT_ENCODER').widgets_values;
    expect(Array.isArray(textEncoderWidgets) ? textEncoderWidgets[0] : undefined)
      .toBe('qwen_3_06b_base.safetensors');
    const vaeWidgets = animaNodeByTitle('MOBILE_VAE_LOADER').widgets_values;
    expect(Array.isArray(vaeWidgets) ? vaeWidgets[0] : undefined)
      .toBe('qwen_image_vae.safetensors');

    expect(animaLinkById(1)).toEqual([1, 1, 0, 2, 0, 'MODEL']);
    expect(animaLinkById(2)).toEqual([2, 23, 0, 2, 1, 'CLIP']);
    expect(animaLinkById(19)).toEqual([19, 24, 0, 11, 1, 'VAE']);
    expect(animaLinkById(23)).toEqual([23, 24, 0, 13, 3, 'VAE']);
    expect(animaLinkById(31)).toEqual([31, 24, 0, 17, 1, 'VAE']);
    expect(animaLinkById(34)).toEqual([34, 24, 0, 19, 1, 'VAE']);
    expect(animaNodeByTitle('MOBILE_LORA_1').inputs[0]?.link).toBe(1);
    expect(animaNodeByTitle('MOBILE_LORA_1').inputs[1]?.link).toBe(2);
    expect(animaNodeByTitle('MOBILE_VAE_DECODE').inputs[1]?.link).toBe(19);

    const graphSignature = (candidate: Workflow) => candidate.nodes
      .map((node) => `${node.type}:${node.title ?? ''}`)
      .sort();
    expect(graphSignature(animaWorkflow)).not.toEqual(graphSignature(workflow));

    for (const title of [
      'MOBILE_LORA_1',
      'MOBILE_LORA_2',
      'MOBILE_LORA_3',
      'MOBILE_HIRES_UPSCALE',
      'MOBILE_HIRES_SAMPLER',
      'MOBILE_FACE_DETAILER',
      'MOBILE_UPSCALE_MODEL',
      'MOBILE_UPSCALE',
    ]) {
      expect(animaNodeByTitle(title)).toBeDefined();
    }
  });
});

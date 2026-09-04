import { describe, expect, it } from 'vitest';
import { generationParamsFromPrompt } from '../generationParamsFromPrompt';

function node(
  classType: string,
  inputs: Record<string, unknown>,
  title?: string,
): Record<string, unknown> {
  return {
    class_type: classType,
    inputs,
    ...(title ? { _meta: { title } } : {}),
  };
}

describe('generationParamsFromPrompt', () => {
  it('restores canonical generation, LoRA, Hires, FaceDetailer, and upscaler values', () => {
    const prompt = {
      checkpoint: node('CheckpointLoaderSimple', { ckpt_name: 'restored/missing.safetensors' }, 'MOBILE_CHECKPOINT'),
      positive: node('CLIPTextEncode', { text: 'a restored positive prompt' }, 'MOBILE_POSITIVE'),
      negative: node('CLIPTextEncode', { text: 'a restored negative prompt' }, 'MOBILE_NEGATIVE'),
      facePositive: node('CLIPTextEncode', { text: 'a restored face positive prompt' }, 'MOBILE_FACE_POSITIVE'),
      faceNegative: node('CLIPTextEncode', { text: 'a restored face negative prompt' }, 'MOBILE_FACE_NEGATIVE'),
      size: node('EmptyLatentImage', { width: 768, height: 1024, batch_size: 3 }, 'MOBILE_SIZE'),
      sampler: node('KSampler', {
        seed: 1234,
        steps: 31,
        cfg: 6.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
      }, 'MOBILE_BASE_SAMPLER'),
      lora1: node('LoraLoader', {
        lora_name: 'restored/missing-style.safetensors',
        strength_model: 0.8,
        strength_clip: 0.7,
      }, 'MOBILE_LORA_1'),
      hiresScale: node('LatentUpscaleBy', { scale_by: 2 }, 'MOBILE_HIRES_UPSCALE'),
      hiresSampler: node('KSampler', {
        seed: 1234,
        steps: 21,
        cfg: 5.5,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 0.4,
      }, 'MOBILE_HIRES_SAMPLER'),
      detector: node('UltralyticsDetectorProvider', { model_name: 'face.pt' }, 'MOBILE_FACE_DETECTOR'),
      detailer: node('FaceDetailer', {
        guide_size: 640,
        max_size: 896,
        steps: 12,
        cfg: 4.5,
        denoise: 0.25,
        bbox_threshold: 0.6,
      }, 'MOBILE_FACE_DETAILER'),
      upscaleModel: node('UpscaleModelLoader', { model_name: 'restored-upscaler.pth' }, 'MOBILE_UPSCALE_MODEL'),
      upscale: node('ImageUpscaleWithModel', {}, 'MOBILE_UPSCALE'),
    };

    const patch = generationParamsFromPrompt(prompt);

    expect(patch).toMatchObject({
      checkpoint: 'restored/missing.safetensors',
      positivePrompt: 'a restored positive prompt',
      negativePrompt: 'a restored negative prompt',
      facePositivePrompt: 'a restored face positive prompt',
      faceNegativePrompt: 'a restored face negative prompt',
      width: 768,
      height: 1024,
      batchSize: 3,
      seed: 1234,
      seedMode: 'fixed',
      steps: 31,
      cfg: 6.5,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      hiresEnabled: true,
      hiresMode: 'latent',
      hiresScale: 2,
      hiresSteps: 21,
      hiresCfg: 5.5,
      hiresDenoise: 0.4,
      hiresSampler: 'euler',
      hiresScheduler: 'simple',
      faceDetailerEnabled: true,
      faceGuideSize: 640,
      faceMaxSize: 896,
      faceSteps: 12,
      faceCfg: 4.5,
      faceDenoise: 0.25,
      faceBBoxThreshold: 0.6,
      upscaleEnabled: true,
      upscaleModel: 'restored-upscaler.pth',
    });
    expect(patch.loras?.[0]).toEqual({
      enabled: true,
      name: 'restored/missing-style.safetensors',
      strengthModel: 0.8,
      strengthClip: 0.7,
    });
    // Prompt restore patches the form only; it cannot replace the canonical graph.
    expect('nodes' in patch).toBe(false);
  });

  it('uses class_type fallback when canonical titles are absent', () => {
    const patch = generationParamsFromPrompt({
      '1': node('CheckpointLoaderSimple', { ckpt_name: 'models/class-fallback.safetensors' }),
      '2': node('CLIPTextEncode', { text: 'positive by order' }),
      '3': node('CLIPTextEncode', { text: 'negative by order' }),
      '4': node('EmptyLatentImage', { width: 512, height: 640, batch_size: 2 }),
      '5': node('KSampler', {
        seed: 9,
        steps: 20,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
      }),
      '6': node('LoraLoader', {
        lora_name: 'models/class-style.safetensors',
        strength_model: 1.1,
        strength_clip: 0.9,
      }),
    });

    expect(patch).toMatchObject({
      checkpoint: 'models/class-fallback.safetensors',
      positivePrompt: 'positive by order',
      negativePrompt: 'negative by order',
      width: 512,
      height: 640,
      batchSize: 2,
      seed: 9,
      steps: 20,
    });
    expect(patch.loras?.[0].name).toBe('models/class-style.safetensors');
    expect(patch).not.toHaveProperty('facePositivePrompt');
    expect(patch).not.toHaveProperty('faceNegativePrompt');
  });

  it('restores the Anima model from its native UNETLoader prompt input', () => {
    const patch = generationParamsFromPrompt({
      model: node('UNETLoader', { unet_name: 'anima-base-v1.0.safetensors' }, 'MOBILE_CHECKPOINT'),
      textEncoder: node('CLIPLoader', {
        clip_name: 'qwen_3_06b_base.safetensors',
        type: 'stable_diffusion',
        device: 'default',
      }, 'MOBILE_TEXT_ENCODER'),
      vae: node('VAELoader', { vae_name: 'qwen_image_vae.safetensors' }, 'MOBILE_VAE_LOADER'),
      positive: node('CLIPTextEncode', { text: 'anima positive' }, 'MOBILE_POSITIVE'),
      negative: node('CLIPTextEncode', { text: 'anima negative' }, 'MOBILE_NEGATIVE'),
      size: node('EmptyLatentImage', { width: 896, height: 1152, batch_size: 1 }, 'MOBILE_SIZE'),
      sampler: node('KSampler', {
        seed: 42,
        steps: 30,
        cfg: 4,
        sampler_name: 'er_sde',
        scheduler: 'simple',
      }, 'MOBILE_BASE_SAMPLER'),
    });

    expect(patch).toMatchObject({
      checkpoint: 'anima-base-v1.0.safetensors',
      positivePrompt: 'anima positive',
      negativePrompt: 'anima negative',
      width: 896,
      height: 1152,
      steps: 30,
      cfg: 4,
      sampler: 'er_sde',
      scheduler: 'simple',
    });
  });

  it('recognizes the active resize Hires branch without a latent scale node', () => {
    const patch = generationParamsFromPrompt({
      '1': node('EmptyLatentImage', { width: 512, height: 512 }),
      '2': node('KSampler', {
        seed: 1,
        steps: 20,
        cfg: 5,
        sampler_name: 'euler',
        scheduler: 'normal',
      }),
      '3': node('ImageScaleBy', {
        upscale_method: 'bicubic',
        scale_by: 1.5,
      }, 'MOBILE_HIRES_RESIZE_IMAGE'),
      '4': node('KSampler', {
        seed: 1,
        steps: 15,
        cfg: 4,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 0.3,
      }, 'MOBILE_HIRES_RESIZE_SAMPLER'),
    });

    expect(patch).toMatchObject({
      hiresEnabled: true,
      hiresMode: 'resize',
      resizeMethod: 'bicubic',
      hiresScale: 1.5,
      hiresSteps: 15,
      hiresDenoise: 0.3,
    });
  });
});

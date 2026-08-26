import type { Workflow, WorkflowNode } from '@/api/types';
import type { GenerationFormState } from '@/hooks/useGenerationForm';
import { getMobileGenerationProfile } from '@/config/workflowProfile';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneWorkflow(workflow: Workflow): Workflow {
  if (typeof structuredClone === 'function') return structuredClone(workflow);
  return JSON.parse(JSON.stringify(workflow)) as Workflow;
}

/** Read a canonical widget while accepting both ComfyUI's array and scalar forms. */
export function getGenerationWidgetValue(node: WorkflowNode | undefined, index: number, name?: string): unknown {
  if (!node) return undefined;
  const values = node.widgets_values as unknown;
  if (Array.isArray(values)) return values[index];
  if (isRecord(values)) {
    if (name && values[name] !== undefined) return values[name];
    return values[String(index)];
  }
  return index === 0 ? values : undefined;
}

function setGenerationWidgetValue(node: WorkflowNode, index: number, value: unknown, name?: string): WorkflowNode {
  const values = node.widgets_values as unknown;
  if (Array.isArray(values)) {
    const next = [...values];
    next[index] = value;
    return { ...node, widgets_values: next };
  }
  if (isRecord(values)) {
    return {
      ...node,
      widgets_values: {
        ...values,
        [name ?? String(index)]: value,
      },
    };
  }
  if (index === 0) return { ...node, widgets_values: [value] };
  const next: unknown[] = Array.from({ length: index + 1 }, () => undefined);
  next[index] = value;
  return { ...node, widgets_values: next };
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function updateNamedNode(
  workflow: Workflow,
  name: string,
  update: (node: WorkflowNode) => WorkflowNode,
): Workflow {
  const index = workflow.nodes.findIndex((node) => {
    const title = typeof node.title === 'string' ? node.title : '';
    const searchName = typeof node.properties?.['Node name for S&R'] === 'string'
      ? node.properties['Node name for S&R']
      : '';
    return title === name || searchName === name;
  });
  if (index < 0) return workflow;
  const nodes = [...workflow.nodes];
  nodes[index] = update(nodes[index]);
  return { ...workflow, nodes };
}

function setMode(workflow: Workflow, name: string, mode: 0 | 4): Workflow {
  return updateNamedNode(workflow, name, (node) => ({ ...node, mode }));
}

/**
 * Apply the form to a cloned mobile workflow. Topology and links are deliberately
 * untouched: optional branches are selected only through ComfyUI bypass modes.
 */
export function applyGenerationFormToWorkflow(
  form: GenerationFormState,
  sourceWorkflow: Workflow,
  resolvedSeed: number = form.seed,
): Workflow {
  let workflow = cloneWorkflow(sourceWorkflow);
  const { nodeNames } = getMobileGenerationProfile(workflow);

  workflow = updateNamedNode(workflow, nodeNames.checkpoint, (node) =>
    setGenerationWidgetValue(node, 0, form.checkpoint, 'ckpt_name'));
  workflow = updateNamedNode(workflow, nodeNames.positive, (node) =>
    setGenerationWidgetValue(node, 0, form.positivePrompt, 'text'));
  workflow = updateNamedNode(workflow, nodeNames.negative, (node) =>
    setGenerationWidgetValue(node, 0, form.negativePrompt, 'text'));

  workflow = updateNamedNode(workflow, nodeNames.size, (node) => {
    let next = setGenerationWidgetValue(node, 0, Math.round(finiteNumber(form.width, 1024)), 'width');
    next = setGenerationWidgetValue(next, 1, Math.round(finiteNumber(form.height, 1536)), 'height');
    return setGenerationWidgetValue(next, 2, 1, 'batch_size');
  });

  workflow = updateNamedNode(workflow, nodeNames.baseSampler, (node) => {
    let next = setGenerationWidgetValue(node, 0, Math.round(finiteNumber(resolvedSeed, 0)), 'seed');
    next = setGenerationWidgetValue(next, 2, Math.round(finiteNumber(form.steps, 28)), 'steps');
    next = setGenerationWidgetValue(next, 3, finiteNumber(form.cfg, 5), 'cfg');
    next = setGenerationWidgetValue(next, 4, form.sampler, 'sampler_name');
    return setGenerationWidgetValue(next, 5, form.scheduler, 'scheduler');
  });

  nodeNames.loraSlots.forEach((name, index) => {
    const lora = form.loras[index];
    workflow = setMode(workflow, name, lora.enabled ? 0 : 4);
    workflow = updateNamedNode(workflow, name, (node) => {
      let next = setGenerationWidgetValue(node, 0, lora.name, 'lora_name');
      next = setGenerationWidgetValue(next, 1, finiteNumber(lora.strengthModel, 1), 'strength_model');
      return setGenerationWidgetValue(next, 2, finiteNumber(lora.strengthClip, 1), 'strength_clip');
    });
  });

  workflow = setMode(workflow, nodeNames.hiresUpscale, form.hiresEnabled ? 0 : 4);
  workflow = setMode(workflow, nodeNames.hiresSampler, form.hiresEnabled ? 0 : 4);
  workflow = updateNamedNode(workflow, nodeNames.hiresUpscale, (node) =>
    setGenerationWidgetValue(node, 1, finiteNumber(form.hiresScale, 1.5), 'scale_by'));
  workflow = updateNamedNode(workflow, nodeNames.hiresSampler, (node) => {
    let next = setGenerationWidgetValue(node, 0, Math.round(finiteNumber(resolvedSeed, 0)), 'seed');
    next = setGenerationWidgetValue(next, 2, Math.round(finiteNumber(form.hiresSteps, 15)), 'steps');
    next = setGenerationWidgetValue(next, 3, finiteNumber(form.hiresCfg, 5), 'cfg');
    next = setGenerationWidgetValue(next, 4, form.hiresSampler, 'sampler_name');
    next = setGenerationWidgetValue(next, 5, form.hiresScheduler, 'scheduler');
    return setGenerationWidgetValue(next, 6, finiteNumber(form.hiresDenoise, 0.35), 'denoise');
  });

  workflow = updateNamedNode(workflow, nodeNames.faceDetector, (node) =>
    setGenerationWidgetValue(node, 0, 'bbox/face_yolov8m.pt', 'model_name'));
  workflow = setMode(workflow, nodeNames.faceDetailer, form.faceDetailerEnabled ? 0 : 4);
  workflow = updateNamedNode(workflow, nodeNames.faceDetailer, (node) => {
    let next = setGenerationWidgetValue(node, 0, Math.round(finiteNumber(form.faceGuideSize, 768)), 'guide_size');
    next = setGenerationWidgetValue(next, 2, Math.round(finiteNumber(form.faceMaxSize, 1024)), 'max_size');
    next = setGenerationWidgetValue(next, 3, Math.round(finiteNumber(resolvedSeed, 0)), 'seed');
    next = setGenerationWidgetValue(next, 5, Math.round(finiteNumber(form.faceSteps, 15)), 'steps');
    next = setGenerationWidgetValue(next, 6, finiteNumber(form.faceCfg, 5), 'cfg');
    next = setGenerationWidgetValue(next, 7, form.sampler, 'sampler_name');
    next = setGenerationWidgetValue(next, 8, form.scheduler, 'scheduler');
    next = setGenerationWidgetValue(next, 9, finiteNumber(form.faceDenoise, 0.35), 'denoise');
    return setGenerationWidgetValue(next, 13, finiteNumber(form.faceBBoxThreshold, 0.5), 'bbox_threshold');
  });

  workflow = setMode(workflow, nodeNames.upscaleModel, form.upscaleEnabled ? 0 : 4);
  workflow = setMode(workflow, nodeNames.upscale, form.upscaleEnabled ? 0 : 4);
  workflow = updateNamedNode(workflow, nodeNames.upscaleModel, (node) =>
    setGenerationWidgetValue(node, 0, form.upscaleModel, 'model_name'));
  workflow = updateNamedNode(workflow, nodeNames.saveImage, (node) =>
    setGenerationWidgetValue(
      node,
      0,
      form.upscaleEnabled
        ? '%date:yyyyMMdd%_upscale/mobile_sdxl'
        : '%date:yyyyMMdd%_normal/mobile_sdxl',
      'filename_prefix',
    ));

  return workflow;
}

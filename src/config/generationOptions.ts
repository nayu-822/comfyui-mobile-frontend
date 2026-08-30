import type { NodeTypes } from '@/api/types';

// These are only a fallback for the short period before /object_info is
// available, or for a server whose sampler node does not expose its combo
// metadata. The live ComfyUI combo list remains the source of truth.
const FALLBACK_SAMPLERS = [
  'euler',
  'euler_cfg_pp',
  'euler_ancestral',
  'euler_ancestral_cfg_pp',
  'heun',
  'heunpp2',
  'dpm_2',
  'dpm_2_ancestral',
  'lms',
  'dpm_fast',
  'dpm_adaptive',
  'dpmpp_2s_ancestral',
  'dpmpp_2s_ancestral_cfg_pp',
  'dpmpp_sde',
  'dpmpp_sde_gpu',
  'dpmpp_2m',
  'dpmpp_2m_cfg_pp',
  'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde',
  'dpmpp_3m_sde_gpu',
  'ddpm',
  'lcm',
  'ipndm',
  'ipndm_v',
  'deis',
  'res_multistep',
  'gradient_estimation',
  'er_sde',
  'seeds_2',
  'seeds_2_plus',
  'sa_solver',
  'ddim',
  'uni_pc',
  'uni_pc_bh2',
];

const FALLBACK_SCHEDULERS = [
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'beta',
];

type ComboInputName = 'sampler_name' | 'scheduler';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function uniqueStringOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const options: string[] = [];
  const seen = new Set<string>();
  for (const option of value) {
    if (typeof option !== 'string' || option.length === 0 || seen.has(option)) continue;
    seen.add(option);
    options.push(option);
  }
  return options;
}

/**
 * Extract choices from the legacy and current /object_info combo formats.
 * Malformed or non-combo input definitions return an empty list.
 */
export function extractComboOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  // Legacy ComfyUI format: [["choice-a", "choice-b"], options].
  const legacyOptions = uniqueStringOptions(input[0]);
  if (legacyOptions.length > 0) return legacyOptions;

  // Current ComfyUI format: ["COMBO", { options: ["choice-a", ...] }].
  if (input[0] !== 'COMBO' || !isRecord(input[1])) return [];
  return uniqueStringOptions(input[1].options);
}

function getLiveComboOptions(
  nodeTypes: NodeTypes | null | undefined,
  inputName: ComboInputName,
): string[] {
  for (const nodeTypeName of ['KSampler', 'KSamplerAdvanced']) {
    const definition = nodeTypes?.[nodeTypeName];
    const input = definition?.input.required?.[inputName]
      ?? definition?.input.optional?.[inputName];
    const options = extractComboOptions(input);
    if (options.length > 0) return Array.from(new Set(options));
  }
  return [];
}

function withCurrentValue(options: string[], currentValue: string): string[] {
  if (!currentValue || options.includes(currentValue)) return options;
  return [...options, currentValue];
}

function getOptions(
  nodeTypes: NodeTypes | null | undefined,
  inputName: ComboInputName,
  fallback: string[],
  currentValue: string,
): string[] {
  const liveOptions = getLiveComboOptions(nodeTypes, inputName);
  return withCurrentValue(liveOptions.length > 0 ? liveOptions : fallback, currentValue);
}

export function getSamplerOptions(
  nodeTypes: NodeTypes | null | undefined,
  currentValue: string,
): string[] {
  return getOptions(nodeTypes, 'sampler_name', FALLBACK_SAMPLERS, currentValue);
}

export function getSchedulerOptions(
  nodeTypes: NodeTypes | null | undefined,
  currentValue: string,
): string[] {
  return getOptions(nodeTypes, 'scheduler', FALLBACK_SCHEDULERS, currentValue);
}

/** Return only the upscale model names advertised by the connected ComfyUI. */
export function getUpscaleModelOptions(
  nodeTypes: NodeTypes | null | undefined,
): string[] {
  const definition = nodeTypes?.UpscaleModelLoader;
  const input = definition?.input.required?.model_name
    ?? definition?.input.optional?.model_name;
  return extractComboOptions(input);
}

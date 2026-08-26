import { create } from 'zustand';

export type LoraSlot = {
  enabled: boolean;
  name: string;
  strengthModel: number;
  strengthClip: number;
};

export type LoraSlots = [LoraSlot, LoraSlot, LoraSlot];
export type SeedMode = 'random' | 'fixed';

export interface GenerationFormState {
  checkpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  seedMode: SeedMode;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  loras: LoraSlots;
  hiresEnabled: boolean;
  faceDetailerEnabled: boolean;
  upscaleEnabled: boolean;
  hiresScale: number;
  hiresSteps: number;
  hiresCfg: number;
  hiresDenoise: number;
  hiresSampler: string;
  hiresScheduler: string;
  faceGuideSize: number;
  faceMaxSize: number;
  faceSteps: number;
  faceCfg: number;
  faceDenoise: number;
  faceBBoxThreshold: number;
  upscaleModel: string;
}

export const DEFAULT_GENERATION_FORM_STATE: GenerationFormState = {
  checkpoint: 'PUT_CHECKPOINT_HERE.safetensors',
  positivePrompt: 'masterpiece, best quality, 1girl',
  negativePrompt: 'lowres, worst quality, bad anatomy',
  width: 1024,
  height: 1536,
  seedMode: 'random',
  seed: 123456789,
  steps: 28,
  cfg: 5,
  sampler: 'euler_ancestral',
  scheduler: 'normal',
  loras: [
    { enabled: false, name: 'PUT_LORA_1_HERE.safetensors', strengthModel: 1, strengthClip: 1 },
    { enabled: false, name: 'PUT_LORA_2_HERE.safetensors', strengthModel: 1, strengthClip: 1 },
    { enabled: false, name: 'PUT_LORA_3_HERE.safetensors', strengthModel: 1, strengthClip: 1 },
  ],
  hiresEnabled: false,
  faceDetailerEnabled: false,
  upscaleEnabled: false,
  hiresScale: 1.5,
  hiresSteps: 15,
  hiresCfg: 5,
  hiresDenoise: 0.35,
  hiresSampler: 'euler_ancestral',
  hiresScheduler: 'normal',
  faceGuideSize: 768,
  faceMaxSize: 1024,
  faceSteps: 15,
  faceCfg: 5,
  faceDenoise: 0.35,
  faceBBoxThreshold: 0.5,
  upscaleModel: '4x-UltraSharp.pth',
};

function cloneDefaultState(): GenerationFormState {
  return {
    ...DEFAULT_GENERATION_FORM_STATE,
    loras: DEFAULT_GENERATION_FORM_STATE.loras.map((slot) => ({ ...slot })) as LoraSlots,
  };
}

type GenerationFormFields = keyof Omit<GenerationFormState, 'loras'>;

interface GenerationFormActions {
  setField: <K extends GenerationFormFields>(field: K, value: GenerationFormState[K]) => void;
  setLora: (index: 0 | 1 | 2, patch: Partial<LoraSlot>) => void;
  patch: (values: Partial<GenerationFormState>) => void;
  reset: () => void;
}

export type GenerationFormStore = GenerationFormState & GenerationFormActions;

/** State for the mobile-first generation form. It intentionally has no workflow graph data. */
export const useGenerationForm = create<GenerationFormStore>((set) => ({
  ...cloneDefaultState(),
  setField: (field, value) => set({ [field]: value } as Partial<GenerationFormState>),
  setLora: (index, patch) => set((state) => {
    const loras = [...state.loras] as LoraSlots;
    loras[index] = { ...loras[index], ...patch };
    return { loras };
  }),
  patch: (values) => set((state) => ({
    ...values,
    ...(values.loras
      ? { loras: values.loras.map((slot) => ({ ...slot })) as LoraSlots }
      : { loras: state.loras }),
  })),
  reset: () => set(cloneDefaultState()),
}));

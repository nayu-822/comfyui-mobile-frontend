import type { ReactNode } from 'react';
import type { NodeTypes } from '@/api/types';
import {
  getSamplerOptions,
  getSchedulerOptions,
  getUpscaleModelOptions,
} from '@/config/generationOptions';
import {
  HIRES_RESIZE_METHODS,
  useGenerationForm,
  type HiresResizeMethod,
} from '@/hooks/useGenerationForm';
import { isEmptyOrPlaceholderModelName } from '@/utils/generationFormValidation';
import { EditableNumberInput } from './EditableNumberInput';

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'text-xs font-medium text-slate-300';
const resizeMethodLabels: Record<HiresResizeMethod, string> = {
  'nearest-exact': 'Nearest',
  bilinear: 'Bilinear',
  bicubic: 'Bicubic',
  lanczos: 'Lanczos',
};

function TextareaSetting({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea
        aria-label={label}
        className={`${inputClass} min-h-16 resize-y`}
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function SelectSetting({
  label,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select
        aria-label={ariaLabel ?? label}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Section({
  title,
  disabled = false,
  children,
}: {
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-white/10 bg-slate-900/50">
      <summary className="cursor-pointer select-none px-3 py-3 text-sm font-semibold text-slate-100">
        {title}
        {disabled && <span className="ml-2 text-xs font-normal text-slate-500">OFF</span>}
      </summary>
      <fieldset disabled={disabled} className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3 disabled:opacity-50">
        {children}
      </fieldset>
    </details>
  );
}

export function AdvancedSettings({ nodeTypes = null }: { nodeTypes?: NodeTypes | null } = {}) {
  const form = useGenerationForm();
  const set = form.setField;
  const samplerOptions = getSamplerOptions(nodeTypes, form.sampler);
  const schedulerOptions = getSchedulerOptions(nodeTypes, form.scheduler);
  const hiresSamplerOptions = getSamplerOptions(nodeTypes, form.hiresSampler);
  const hiresSchedulerOptions = getSchedulerOptions(nodeTypes, form.hiresScheduler);
  const upscaleModelOptions = getUpscaleModelOptions(nodeTypes);
  const currentUpscaleModelIsUnlisted = Boolean(form.upscaleModel)
    && !upscaleModelOptions.includes(form.upscaleModel);

  return (
    <section className="space-y-2" aria-labelledby="advanced-generation-settings">
      <h2 id="advanced-generation-settings" className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
        Advanced settings
      </h2>

      <Section title="Sampling">
        <div className="grid grid-cols-2 gap-2">
          <EditableNumberInput
            label="Steps"
            ariaLabel="Sampling Steps"
            value={form.steps}
            min={1}
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('steps', value)}
          />
          <EditableNumberInput
            label="CFG"
            ariaLabel="Sampling CFG"
            value={form.cfg}
            min={0}
            step="0.1"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('cfg', value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectSetting
            label="Base sampler"
            ariaLabel="Base sampler"
            value={form.sampler}
            options={samplerOptions}
            onChange={(value) => set('sampler', value)}
          />
          <SelectSetting
            label="Base scheduler"
            ariaLabel="Base scheduler"
            value={form.scheduler}
            options={schedulerOptions}
            onChange={(value) => set('scheduler', value)}
          />
        </div>
      </Section>

      <Section title="Hires.fix" disabled={!form.hiresEnabled}>
        {form.hiresEnabled && (
          <label className="block">
            <span className={labelClass}>Hires method</span>
            <select
              aria-label="Hires method"
              className={inputClass}
              value={form.hiresMode}
              onChange={(event) => set('hiresMode', event.currentTarget.value as typeof form.hiresMode)}
            >
              <option value="latent">Latent</option>
              <option value="resize">Resize</option>
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <EditableNumberInput
            label="Scale"
            ariaLabel="Hires Scale"
            value={form.hiresScale}
            min={1}
            step="0.05"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('hiresScale', value)}
          />
          <EditableNumberInput
            label="Steps"
            ariaLabel="Hires Steps"
            value={form.hiresSteps}
            min={1}
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('hiresSteps', value)}
          />
          <EditableNumberInput
            label="CFG"
            ariaLabel="Hires CFG"
            value={form.hiresCfg}
            min={0}
            step="0.1"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('hiresCfg', value)}
          />
          <EditableNumberInput
            label="Denoise"
            ariaLabel="Hires Denoise"
            value={form.hiresDenoise}
            min={0}
            max={1}
            step="0.01"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('hiresDenoise', value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SelectSetting
            label="Hires sampler"
            ariaLabel="Hires sampler"
            value={form.hiresSampler}
            options={hiresSamplerOptions}
            onChange={(value) => set('hiresSampler', value)}
          />
          <SelectSetting
            label="Hires scheduler"
            ariaLabel="Hires scheduler"
            value={form.hiresScheduler}
            options={hiresSchedulerOptions}
            onChange={(value) => set('hiresScheduler', value)}
          />
        </div>
        {form.hiresEnabled && form.hiresMode === 'resize' && (
          <label className="block">
            <span className={labelClass}>Resize method</span>
            <select
              aria-label="Resize method"
              className={inputClass}
              value={form.resizeMethod}
              onChange={(event) => set('resizeMethod', event.currentTarget.value as HiresResizeMethod)}
            >
              {HIRES_RESIZE_METHODS.map((method) => (
                <option key={method} value={method}>{resizeMethodLabels[method]}</option>
              ))}
            </select>
          </label>
        )}
      </Section>

      <Section title="FaceDetailer" disabled={!form.faceDetailerEnabled}>
        <TextareaSetting
          label="Positive Prompt"
          value={form.facePositivePrompt}
          placeholder="Use main positive prompt"
          onChange={(value) => set('facePositivePrompt', value)}
        />
        <TextareaSetting
          label="Negative Prompt"
          value={form.faceNegativePrompt}
          placeholder="Use main negative prompt"
          onChange={(value) => set('faceNegativePrompt', value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <EditableNumberInput
            label="Guide Size"
            ariaLabel="FaceDetailer Guide Size"
            value={form.faceGuideSize}
            min={1}
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('faceGuideSize', value)}
          />
          <EditableNumberInput
            label="Max Size"
            ariaLabel="FaceDetailer Max Size"
            value={form.faceMaxSize}
            min={1}
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('faceMaxSize', value)}
          />
          <EditableNumberInput
            label="Steps"
            ariaLabel="FaceDetailer Steps"
            value={form.faceSteps}
            min={1}
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('faceSteps', value)}
          />
          <EditableNumberInput
            label="CFG"
            ariaLabel="FaceDetailer CFG"
            value={form.faceCfg}
            min={0}
            step="0.1"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('faceCfg', value)}
          />
          <EditableNumberInput
            label="Denoise"
            ariaLabel="FaceDetailer Denoise"
            value={form.faceDenoise}
            min={0}
            max={1}
            step="0.01"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('faceDenoise', value)}
          />
          <EditableNumberInput
            label="BBox Threshold"
            ariaLabel="FaceDetailer BBox Threshold"
            value={form.faceBBoxThreshold}
            min={0}
            max={1}
            step="0.01"
            className={inputClass}
            labelClass={labelClass}
            onChange={(value) => set('faceBBoxThreshold', value)}
          />
        </div>
      </Section>

      <Section title="Upscaler" disabled={!form.upscaleEnabled}>
        <label className="block">
          <span className={labelClass}>Upscale Model</span>
          <select
            aria-label="Upscale Model"
            className={inputClass}
            value={form.upscaleModel}
            disabled={!form.upscaleEnabled}
            onChange={(event) => set('upscaleModel', event.currentTarget.value)}
          >
            {!form.upscaleModel && (
              <option value="">
                Choose an upscale model{upscaleModelOptions.length === 0 ? ' (no models found)' : ''}
              </option>
            )}
            {currentUpscaleModelIsUnlisted && (
              <option value={form.upscaleModel}>
                {isEmptyOrPlaceholderModelName(form.upscaleModel)
                  ? 'Choose an upscale model'
                  : `Restored model (not detected): ${form.upscaleModel}`}
              </option>
            )}
            {upscaleModelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
      </Section>
    </section>
  );
}

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationForm } from '@/hooks/useGenerationForm';

vi.mock('@/hooks/useCheckpoints', () => ({
  useCheckpoints: () => ({
    checkpoints: [],
    status: 'loaded',
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLoras', () => ({
  useLoras: () => ({
    loras: [],
    status: 'loaded',
    error: null,
    reload: vi.fn(),
  }),
}));

vi.mock('@/hooks/useWorkflow', () => ({
  useWorkflowStore: (selector: (state: { nodeTypes: null }) => unknown) =>
    selector({ nodeTypes: null }),
}));

vi.mock('../BasicSettings', () => ({ BasicSettings: () => <div data-testid="basic-settings" /> }));
vi.mock('../FeatureToggles', () => ({ FeatureToggles: () => <div data-testid="feature-toggles" /> }));
vi.mock('../AdvancedSettings', () => ({ AdvancedSettings: () => <div data-testid="advanced-settings" /> }));
vi.mock('../BatchSettings', () => ({ BatchSettings: () => <div data-testid="batch-settings" /> }));

import { GenerationPanel } from '../GenerationPanel';

describe('GenerationPanel fixed UI layout', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGenerationForm.getState().reset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('reserves the shared BottomBar plus spacing below the last setting', async () => {
    await act(async () => root.render(<GenerationPanel visible />));

    const panel = container.querySelector('[data-testid="generation-panel"]') as HTMLElement | null;
    expect(panel?.style.paddingBottom).toBe(
      'calc(var(--bottom-bar-offset, 80px) + 1rem)',
    );
    const order = ['basic-settings', 'feature-toggles', 'advanced-settings', 'batch-settings'];
    const positions = order.map((testId) => {
      const element = container.querySelector(`[data-testid="${testId}"]`);
      expect(element).not.toBeNull();
      return Array.from(container.querySelectorAll('[data-testid]')).indexOf(element as HTMLElement);
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

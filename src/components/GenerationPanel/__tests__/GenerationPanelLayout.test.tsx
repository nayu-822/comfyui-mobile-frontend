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

vi.mock('../BasicSettings', () => ({ BasicSettings: () => null }));
vi.mock('../FeatureToggles', () => ({ FeatureToggles: () => null }));
vi.mock('../AdvancedSettings', () => ({ AdvancedSettings: () => null }));

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
  });
});

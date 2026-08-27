import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationForm } from '@/hooks/useGenerationForm';

const simpleGenerationState = vi.hoisted(() => ({
  activePromptIds: [] as string[],
  isGenerating: false,
  isCancelling: false,
  cancelGeneration: vi.fn(),
}));

vi.mock('@/hooks/useSimpleGeneration', () => ({
  useSimpleGeneration: () => simpleGenerationState,
}));

import { BatchSettings } from '../BatchSettings';

describe('BatchSettings', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGenerationForm.getState().reset();
    simpleGenerationState.activePromptIds = [];
    simpleGenerationState.isGenerating = false;
    simpleGenerationState.isCancelling = false;
    simpleGenerationState.cancelGeneration.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders the default batch values and total image count', async () => {
    await act(async () => root.render(<BatchSettings />));

    expect((container.querySelector('[aria-label="Batch size"]') as HTMLSelectElement).value).toBe('1');
    expect((container.querySelector('[aria-label="Batch count"]') as HTMLSelectElement).value).toBe('1');
    expect(container.querySelector('[data-testid="total-images"]')?.textContent).toBe('Total images: 1');
    expect(container.querySelector('[data-testid="cancel-generation-button"]')).toBeNull();
  });

  it('updates total images and exposes cancel only for an active simple batch', async () => {
    useGenerationForm.getState().patch({ batchSize: 2, batchCount: 4 });
    simpleGenerationState.activePromptIds = ['simple-prompt-1'];

    await act(async () => root.render(<BatchSettings />));

    expect(container.querySelector('[data-testid="total-images"]')?.textContent).toBe('Total images: 8');
    const cancelButton = container.querySelector('[data-testid="cancel-generation-button"]') as HTMLButtonElement | null;
    expect(cancelButton?.textContent).toBe('Cancel generation');
    expect(cancelButton?.disabled).toBe(false);

    await act(async () => cancelButton?.click());
    expect(simpleGenerationState.cancelGeneration).toHaveBeenCalledTimes(1);
  });

  it('shows Cancelling and prevents a second cancel click while cancelling', async () => {
    simpleGenerationState.activePromptIds = ['simple-prompt-1'];
    simpleGenerationState.isCancelling = true;

    await act(async () => root.render(<BatchSettings />));

    const cancelButton = container.querySelector('[data-testid="cancel-generation-button"]') as HTMLButtonElement | null;
    expect(cancelButton?.textContent).toBe('Cancelling…');
    expect(cancelButton?.disabled).toBe(true);
  });
});

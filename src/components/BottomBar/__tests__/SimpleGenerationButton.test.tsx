import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generationState = {
  canGenerate: true,
  isGenerating: false,
  error: null as string | null,
  hasLatestImage: false,
  generate: vi.fn(),
  openLatestImage: vi.fn(),
};

const navigationState = vi.hoisted(() => ({
  setCurrentPanel: vi.fn(),
}));

vi.mock('@/hooks/useSimpleGeneration', () => ({
  useSimpleGeneration: () => generationState,
}));
vi.mock('@/hooks/useNavigation', () => ({
  useNavigationStore: (selector: (state: typeof navigationState) => unknown) =>
    selector(navigationState),
}));

import { SimpleGenerationButton } from '../SimpleGenerationButton';

describe('SimpleGenerationButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    generationState.canGenerate = true;
    generationState.isGenerating = false;
    generationState.error = null;
    generationState.hasLatestImage = false;
    generationState.generate.mockReset();
    generationState.openLatestImage.mockReset();
    navigationState.setCurrentPanel.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders a full-width Generate action and delegates submission', async () => {
    await act(async () => root.render(<SimpleGenerationButton />));

    const buttons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const latestButton = container.querySelector('[data-testid="latest-image-button"]') as HTMLButtonElement | null;
    const outputsButton = container.querySelector('[data-testid="outputs-button"]') as HTMLButtonElement | null;
    const button = container.querySelector('[data-testid="simple-generation-button"]') as HTMLButtonElement | null;
    expect(buttons.map((item) => item.textContent)).toEqual(['Latest', 'Outputs', 'Generate']);
    expect(latestButton?.disabled).toBe(true);
    expect(outputsButton?.disabled).toBe(false);
    expect(button?.textContent).toBe('Generate');
    expect(button?.disabled).toBe(false);
    expect(button?.className).toContain('w-full');
    expect(container.querySelector('[data-testid="simple-generation-controls"]')).not.toBeNull();

    await act(async () => button?.click());
    expect(generationState.generate).toHaveBeenCalledTimes(1);
  });

  it('opens Outputs even when there are no generated images', async () => {
    await act(async () => root.render(<SimpleGenerationButton />));

    const outputsButton = container.querySelector('[data-testid="outputs-button"]') as HTMLButtonElement | null;
    expect(outputsButton?.disabled).toBe(false);
    expect(outputsButton?.getAttribute('aria-label')).toBe('Open outputs');

    await act(async () => outputsButton?.click());
    expect(navigationState.setCurrentPanel).toHaveBeenCalledWith('outputs');
  });

  it('enables the latest-image action when history has an image and opens it', async () => {
    generationState.hasLatestImage = true;

    await act(async () => root.render(<SimpleGenerationButton />));

    const latestButton = container.querySelector('[data-testid="latest-image-button"]') as HTMLButtonElement | null;
    expect(latestButton?.disabled).toBe(false);
    expect(latestButton?.getAttribute('aria-label')).toBe('View latest generated image');

    await act(async () => latestButton?.click());
    expect(generationState.openLatestImage).toHaveBeenCalledTimes(1);
  });

  it('reflects disabled and queueing state without a success status', async () => {
    generationState.canGenerate = false;
    generationState.isGenerating = true;

    await act(async () => root.render(<SimpleGenerationButton />));

    const button = container.querySelector('[data-testid="simple-generation-button"]') as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Queueing…');
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(container.textContent).not.toContain('Generation queued. Seed:');
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('keeps execution errors visible without rendering them as success status', async () => {
    generationState.error = 'Failed to queue generation.';

    await act(async () => root.render(<SimpleGenerationButton />));

    expect(container.querySelector('[role="alert"]')?.textContent)
      .toBe('Failed to queue generation.');
  });
});

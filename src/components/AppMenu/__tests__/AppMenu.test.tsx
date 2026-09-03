import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppMenu } from '@/components/AppMenu';
import { useNavigationStore } from '@/hooks/useNavigation';

describe('AppMenu workflow file picker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useNavigationStore.setState({ currentPanel: 'workflow', currentGenerationMode: 'sdxl' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps one stable picker mounted while the slide panel closes and reopens', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(<AppMenu open onClose={onClose} />);
    });

    const picker = container.querySelector<HTMLInputElement>('[data-workflow-file-input]');
    expect(picker).not.toBeNull();
    expect(picker?.accept).toContain('.json');

    await act(async () => {
      root.render(<AppMenu open={false} onClose={onClose} />);
    });

    expect(picker?.isConnected).toBe(true);
    expect(container.querySelector('[data-workflow-file-input]')).toBe(picker);

    await act(async () => {
      root.render(<AppMenu open onClose={onClose} />);
    });

    expect(container.querySelector('[data-workflow-file-input]')).toBe(picker);
    expect(document.querySelectorAll('[data-workflow-file-input]')).toHaveLength(1);
  });

  it('offers distinct SDXL and Anima Simple Generation entries', async () => {
    await act(async () => {
      root.render(<AppMenu open onClose={vi.fn()} />);
    });

    expect(document.querySelector('[data-testid="simple-generation-sdxl"]')?.textContent)
      .toContain('Simple Generation (SDXL)');
    const animaButton = document.querySelector<HTMLButtonElement>(
      '[data-testid="simple-generation-anima"]',
    );
    expect(animaButton?.textContent).toContain('Simple Generation (Anima)');

    await act(async () => {
      animaButton?.click();
    });

    expect(useNavigationStore.getState().currentPanel).toBe('generation');
    expect(useNavigationStore.getState().currentGenerationMode).toBe('anima');
  });
});

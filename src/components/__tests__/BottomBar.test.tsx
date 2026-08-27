import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workflow: {
    workflow: { nodes: [], links: [] },
    infiniteLoop: false,
    setInfiniteLoop: vi.fn(),
    isStopping: false,
    isExecuting: false,
    executingPromptId: null,
    workflowDurationStats: {},
  },
  imageViewer: {
    viewerIdle: false,
    viewerOpen: false,
    viewerImages: [],
    viewerIndex: 0,
  },
  workflowSelection: { selectionMode: false },
  queue: { pending: [], running: [] },
  generationSettings: {
    infiniteModeEnabled: false,
    hideBottomBarWhenViewerIdle: false,
  },
}));

vi.mock('@/hooks/useWorkflow', () => ({
  useWorkflowStore: (selector: (state: typeof mocks.workflow) => unknown) =>
    selector(mocks.workflow),
}));

vi.mock('@/hooks/useImageViewer', () => ({
  useImageViewerStore: (selector: (state: typeof mocks.imageViewer) => unknown) =>
    selector(mocks.imageViewer),
}));

vi.mock('@/hooks/useWorkflowSelection', () => ({
  useWorkflowSelectionStore: (selector: (state: typeof mocks.workflowSelection) => unknown) =>
    selector(mocks.workflowSelection),
}));

vi.mock('@/hooks/useQueue', () => ({
  useQueueStore: (selector: (state: typeof mocks.queue) => unknown) =>
    selector(mocks.queue),
}));

vi.mock('@/hooks/useGenerationSettings', () => ({
  useGenerationSettingsStore: (selector: (state: typeof mocks.generationSettings) => unknown) =>
    selector(mocks.generationSettings),
}));

vi.mock('@/hooks/useOverallProgress', () => ({
  useOverallProgress: () => null,
}));

vi.mock('@/components/BottomBar/BottomStatusOverlay', () => ({
  BottomStatusOverlay: () => <div data-testid="bottom-status-overlay" />,
}));
vi.mock('@/components/BottomBar/FollowQueueButton', () => ({
  FollowQueueButton: () => <button data-testid="follow-queue-button" type="button">Follow</button>,
}));
vi.mock('@/components/BottomBar/InfiniteLoopToggle', () => ({
  InfiniteLoopToggle: () => <button data-testid="infinite-loop-toggle" type="button">Infinite</button>,
}));
vi.mock('@/components/BottomBar/PinnedWidgetOverlayModal', () => ({
  PinnedWidgetOverlayModal: () => null,
}));
vi.mock('@/components/BottomBar/OutputsActionButton', () => ({
  OutputsActionButton: () => <button data-testid="outputs-action-button" type="button">Outputs</button>,
}));
vi.mock('@/components/BottomBar/PinnedWidgetButton', () => ({
  PinnedWidgetButton: () => <button data-testid="pinned-widget-button" type="button">Pinned</button>,
}));
vi.mock('@/components/BottomBar/RunButton', () => ({
  RunButton: () => <button data-testid="run-button" type="button">Run</button>,
}));
vi.mock('@/components/BottomBar/RunCountSelector', () => ({
  RunCountSelector: () => <button data-testid="run-count-selector" type="button">Count</button>,
}));
vi.mock('@/components/BottomBar/SkipButton', () => ({
  SkipButton: () => <button data-testid="skip-button" type="button">Skip</button>,
}));
vi.mock('@/components/BottomBar/WorkflowSelectionButton', () => ({
  WorkflowSelectionButton: () => <button data-testid="workflow-selection-button" type="button">Select</button>,
}));
vi.mock('@/components/BottomBar/SimpleGenerationButton', () => ({
  SimpleGenerationButton: () => (
    <div data-testid="simple-generation-controls">
      <button data-testid="latest-image-button" type="button">Latest</button>
      <button data-testid="simple-generation-button" type="button">Generate</button>
    </div>
  ),
}));

import { BottomBar } from '@/components/BottomBar';

describe('BottomBar panel-specific controls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('uses one shared bar for Generation and hides workflow controls', async () => {
    await act(async () => root.render(<BottomBar currentPanel="generation" />));

    expect(container.querySelector('#bottom-bar-root')).not.toBeNull();
    expect(container.querySelector('[data-testid="latest-image-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="simple-generation-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="generation-submit-bar"]')).toBeNull();
    expect(container.querySelector('[data-testid="run-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="run-count-selector"]')).toBeNull();
    expect(container.querySelector('[data-testid="skip-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="follow-queue-button"]')).toBeNull();
    expect(container.querySelectorAll('#bottom-bar-root')).toHaveLength(1);
  });

  it('keeps the normal workflow controls outside Generation', async () => {
    await act(async () => root.render(<BottomBar currentPanel="workflow" />));

    expect(container.querySelector('[data-testid="simple-generation-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="latest-image-button"]')).toBeNull();
    expect(container.querySelector('[data-testid="run-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="run-count-selector"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="skip-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pinned-widget-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="follow-queue-button"]')).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { getCheckpointAutoSelection } from '@/utils/checkpointSelection';

describe('getCheckpointAutoSelection', () => {
  const checkpoints = ['models/a.safetensors', 'models/b.safetensors'];

  it('preserves a restored checkpoint that is not in the current list', () => {
    expect(getCheckpointAutoSelection({
      currentCheckpoint: 'restored/missing.safetensors',
      restoredCheckpointValue: 'restored/missing.safetensors',
      checkpoints,
    })).toBeUndefined();
  });

  it('preserves an explicit missing checkpoint after a component remount', () => {
    expect(getCheckpointAutoSelection({
      currentCheckpoint: 'restored/missing.safetensors',
      restoredCheckpointValue: null,
      checkpoints,
    })).toBeUndefined();
  });

  it('does not treat a manually selected listed checkpoint as restored', () => {
    expect(getCheckpointAutoSelection({
      currentCheckpoint: 'models/b.safetensors',
      restoredCheckpointValue: 'restored/missing.safetensors',
      checkpoints,
    })).toBeUndefined();
  });

  it('selects the first checkpoint after the form returns to a placeholder', () => {
    expect(getCheckpointAutoSelection({
      currentCheckpoint: 'PUT_CHECKPOINT_HERE.safetensors',
      restoredCheckpointValue: 'restored/missing.safetensors',
      checkpoints,
    })).toBe('models/a.safetensors');
    expect(getCheckpointAutoSelection({
      currentCheckpoint: '',
      restoredCheckpointValue: 'restored/missing.safetensors',
      checkpoints,
    })).toBe('models/a.safetensors');
  });
});

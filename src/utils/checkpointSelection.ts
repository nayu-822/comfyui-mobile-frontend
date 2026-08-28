import { isEmptyOrPlaceholderModelName } from './generationFormValidation';

export interface CheckpointSelectionInput {
  currentCheckpoint: string;
  restoredCheckpointValue: string | null;
  checkpoints: readonly string[];
}

/**
 * Return the automatic checkpoint selection, or undefined when the current
 * value should be left untouched.
 */
export function getCheckpointAutoSelection({
  currentCheckpoint,
  restoredCheckpointValue,
  checkpoints,
}: CheckpointSelectionInput): string | undefined {
  const isRestoredCheckpoint =
    restoredCheckpointValue !== null && currentCheckpoint === restoredCheckpointValue;

  // A restored model can be absent from /object_info. Preserve any concrete
  // current value even after GenerationPanel remounts and loses its local
  // restore marker; only the shipped placeholder/empty value is eligible for
  // automatic first-checkpoint selection.
  if (
    isRestoredCheckpoint
    || checkpoints.includes(currentCheckpoint)
    || !isEmptyOrPlaceholderModelName(currentCheckpoint)
  ) return undefined;

  const firstCheckpoint = checkpoints[0] ?? '';
  return firstCheckpoint === currentCheckpoint ? undefined : firstCheckpoint;
}

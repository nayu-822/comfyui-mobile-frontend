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

  if (isRestoredCheckpoint || checkpoints.includes(currentCheckpoint)) return undefined;

  const firstCheckpoint = checkpoints[0] ?? '';
  return firstCheckpoint === currentCheckpoint ? undefined : firstCheckpoint;
}

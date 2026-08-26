export interface CheckpointListResponse {
  items: string[];
}

export async function getCheckpoints(): Promise<string[]> {
  const response = await fetch('/mobile/api/checkpoints', { cache: 'no-store' });
  const data = await response.json().catch(() => null) as Partial<CheckpointListResponse> & { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Failed to load checkpoints';
    throw new Error(message);
  }
  if (!Array.isArray(data?.items)) {
    throw new Error('Invalid checkpoint list response');
  }
  return data.items.filter((item): item is string => typeof item === 'string');
}

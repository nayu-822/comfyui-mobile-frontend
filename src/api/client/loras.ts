export interface LoraListResponse {
  items: string[];
}

export async function getLoras(): Promise<string[]> {
  const response = await fetch('/mobile/api/loras', { cache: 'no-store' });
  const data = await response.json().catch(() => null) as Partial<LoraListResponse> & { error?: unknown } | null;
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Failed to load LoRAs';
    throw new Error(message);
  }
  if (!Array.isArray(data?.items)) {
    throw new Error('Invalid LoRA list response');
  }
  return data.items.filter((item): item is string => typeof item === 'string');
}

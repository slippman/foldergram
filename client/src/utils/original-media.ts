export function getOriginalMediaUrl(id: number): string {
  return `/api/originals/${id}`;
}

export function getOriginalMediaDownloadUrl(id: number): string {
  return `${getOriginalMediaUrl(id)}?download=1`;
}

export function getSharedOriginalMediaDownloadUrl(id: number, previewUrl?: string): string {
  if (previewUrl?.startsWith('/api/share/media/')) return previewUrl.replace(/\/preview\.[a-z0-9]+$/, '/original');
  return `/api/share/images/${id}/original`;
}

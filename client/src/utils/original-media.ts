export function getOriginalMediaUrl(id: number): string {
  return `/api/originals/${id}`;
}

export function getOriginalMediaDownloadUrl(id: number): string {
  return `${getOriginalMediaUrl(id)}?download=1`;
}

export function getSharedOriginalMediaDownloadUrl(id: number): string {
  return `/api/share/images/${id}/original`;
}

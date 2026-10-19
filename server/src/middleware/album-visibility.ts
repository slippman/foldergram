import type { RequestHandler } from 'express';
import { folderRepository, imageRepository, postRepository } from '../db/repositories.js';
import { authService } from '../services/auth-service.js';
import { withAlbumAccess, canReadLinkOnlyAlbums } from '../services/album-access-context.js';
import { canReadAlbum } from '../services/album-access-service.js';

// Guard numeric/direct endpoints too: hiding an album from lists is insufficient.
export const requireAlbumVisibility: RequestHandler = (request, response, next) => {
  if (canReadLinkOnlyAlbums()) { next(); return; }
  let folderId: number | undefined;
  const folderMatch = /^\/folders\/([^/]+)/i.exec(request.path);
  const mediaMatch = /(?:^|\/)(posts|images|originals)\/(\d+)(?:\/|$)/i.exec(request.path);
  if (folderMatch) {
    try { folderId = folderRepository.getBySlug(decodeURIComponent(folderMatch[1]))?.id; }
    catch { response.status(404).json({ message: 'Album not found' }); return; }
    if (folderId === undefined) { next(); return; }
  } else if (mediaMatch) {
    const id = Number(mediaMatch[2]);
    if (!Number.isSafeInteger(id) || id <= 0) { next(); return; }
    folderId = mediaMatch[1].toLowerCase() === 'posts'
      ? postRepository.findById(id)?.folder_id
      : (postRepository.findByImageId(id)?.folder_id ?? imageRepository.getById(id)?.folder_id);
  }
  if (folderId !== undefined && !canReadAlbum(folderId)) {
    response.status(404).json({ message: 'Album not found' });
    return;
  }
  next();
};

// Protect the legacy cookie-gated derivative URLs as well as numeric APIs.
// Public signed media continues to use its existing scoped capability checks.
export function requireDerivativeAlbumVisibility(kind: 'thumbnail' | 'preview'): RequestHandler {
  return (request, response, next) => {
    const context = authService.getRequestAuthContext(request);
    if (context.role === 'admin') { next(); return; }
    let relativePath: string;
    try { relativePath = decodeURIComponent(request.path).replace(/^\/+/, ''); }
    catch { response.status(404).end(); return; }
    const image = kind === 'thumbnail'
      ? imageRepository.getByThumbnailPath(relativePath)
      : imageRepository.getByPreviewPath(relativePath);
    if (!image || !withAlbumAccess(false, () => canReadAlbum(image.folder_id))) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Vary', 'Cookie');
      response.status(404).end();
      return;
    }
    next();
  };
}

import { createHash } from 'node:crypto';
import type express from 'express';
import { imageRepository, scanRunRepository } from '../db/repositories.js';
import { appConfig } from '../config/env.js';
import { galleryService } from './gallery-service.js';
import { folderShareService } from './folder-share-service.js';
import type { ImageRecord } from '../types/models.js';

export function mediaCacheUrl(request: express.Request, image: ImageRecord, kind: 'thumbnail' | 'preview' | 'original' | 'source'): string | null {
  if (!appConfig.mediaCacheEnabled) return null;
  const token = folderShareService.createMediaToken(request, image.folder_id, sharedMediaScope(image), image.id);
  if (!token) return null;
  const extension = kind === 'thumbnail' ? 'webp' : kind === 'preview'
    ? image.media_type === 'video' ? 'mp4' : image.is_animated ? image.extension : 'webp' : image.extension;
  return `/api/share/media/${token}/${kind}.${extension}`;
}
export function sharedMediaScope(image: ImageRecord): string {
  return createHash('sha256').update(JSON.stringify([image.id, image.folder_id,
    image.checksum_or_fingerprint, image.mtime_ms, image.file_size,
    image.thumbnail_path, image.preview_path, scanRunRepository.latestCompleted()?.id ?? null])).digest('hex');
}

// Only grant holders receive these asset-specific capabilities. Metadata stays private.
export function cacheSharedMediaUrls<T>(request: express.Request, payload: T): T {
  if (!appConfig.mediaCacheEnabled) return payload;
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if ((key === 'thumbnailUrl' || key === 'previewUrl' || key === 'avatarUrl' || key === 'avatarThumbnailUrl') && typeof child === 'string') {
        const match = child.match(/^\/api\/share\/images\/(\d+)\/(thumbnail|preview)(?:\?|$)/);
        if (match) {
          const image = galleryService.getShareDerivativeImage(Number(match[1]));
          if (image) {
            const url = mediaCacheUrl(request, image, match[2] as 'thumbnail' | 'preview');
            if (url) return [key, url];
          }
        }
      }
      return [key, visit(child)];
    }));
  }
  return visit(payload) as T;
}

// Run only after full-library API authentication. Keep metadata itself uncached.
export function cacheLibraryMediaUrls<T>(request: express.Request, payload: T): T {
  if (!appConfig.mediaCacheEnabled) return payload;
  const urls = new Map<string, string>();
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (['thumbnailUrl', 'previewUrl', 'originalUrl', 'avatarUrl', 'avatarThumbnailUrl'].includes(key) && typeof child === 'string') {
        if (urls.has(child)) return [key, urls.get(child)];
        const derivative = child.match(/^\/(thumbnails|previews)\/([^?]+)(?:\?.*)?$/);
        const original = child.match(/^\/api\/originals\/(\d+)(?:\?.*)?$/);
        let image: ImageRecord | undefined;
        let kind: 'thumbnail' | 'preview' | 'source' = 'source';
        if (derivative) {
          try {
            const path = decodeURIComponent(derivative[2]);
            kind = derivative[1] === 'thumbnails' ? 'thumbnail' : 'preview';
            image = kind === 'thumbnail' ? imageRepository.getByThumbnailPath(path) : imageRepository.getByPreviewPath(path);
          } catch { /* Leave malformed URLs to the existing protected routes. */ }
        } else if (original) image = imageRepository.getById(Number(original[1]));
        const scoped = image && galleryService.getShareDerivativeImage(image.id);
        const url = scoped ? mediaCacheUrl(request, scoped, kind) : null;
        urls.set(child, url ?? child);
        return [key, url ?? child];
      }
      return [key, visit(child)];
    }));
  }
  return visit(payload) as T;
}

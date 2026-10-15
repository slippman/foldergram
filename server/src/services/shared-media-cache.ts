import { createHash } from 'node:crypto';
import type express from 'express';
import { imageRepository, scanRunRepository } from '../db/repositories.js';
import { appConfig } from '../config/env.js';
import { galleryService } from './gallery-service.js';
import { folderShareService } from './folder-share-service.js';
import type { ImageRecord } from '../types/models.js';

type MediaKind = 'thumbnail' | 'preview' | 'original' | 'source';

function createUrlBuilder(request: express.Request) {
  const sign = folderShareService.createMediaTokenFactory(request);
  const scanVersion = scanRunRepository.latestCompleted()?.id ?? null;
  const tokens = new Map<number, string | null>();
  return (image: ImageRecord, kind: MediaKind): string | null => {
    if (!tokens.has(image.id)) tokens.set(image.id, sign(image.folder_id, sharedMediaScope(image, scanVersion), image.id));
    const token = tokens.get(image.id);
    if (!token) return null;
    const sourceExtension = image.extension.replace(/^\.+/, '').toLowerCase();
    const extension = kind === 'thumbnail' ? 'webp' : kind === 'preview'
      ? image.media_type === 'video' ? 'mp4' : image.is_animated ? sourceExtension : 'webp' : sourceExtension;
    return `/api/share/media/${token}/${kind}.${extension}`;
  };
}

export function mediaCacheUrl(request: express.Request, image: ImageRecord, kind: MediaKind): string | null {
  return appConfig.mediaCacheEnabled ? createUrlBuilder(request)(image, kind) : null;
}
export function sharedMediaScope(image: ImageRecord, scanVersion = scanRunRepository.latestCompleted()?.id ?? null): string {
  return createHash('sha256').update(JSON.stringify([image.id, image.folder_id,
    image.checksum_or_fingerprint, image.mtime_ms, image.file_size,
    image.thumbnail_path, image.preview_path, scanVersion])).digest('hex');
}

// Only grant holders receive these asset-specific capabilities. Metadata stays private.
export function cacheSharedMediaUrls<T>(request: express.Request, payload: T): T {
  if (!appConfig.mediaCacheEnabled) return payload;
  const resolve = galleryService.createShareDerivativeResolver();
  const urlFor = createUrlBuilder(request);
  function visit(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if ((key === 'thumbnailUrl' || key === 'previewUrl' || key === 'avatarUrl' || key === 'avatarThumbnailUrl') && typeof child === 'string') {
        const match = child.match(/^\/api\/share\/images\/(\d+)\/(thumbnail|preview)(?:\?|$)/);
        if (match) {
          const image = resolve(Number(match[1]));
          if (image) {
            const url = urlFor(image, match[2] as 'thumbnail' | 'preview');
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
  const records = new Map<string, ImageRecord | undefined>();
  const resolve = galleryService.createShareDerivativeResolver();
  const urlFor = createUrlBuilder(request);
  function remember(image: ImageRecord | undefined) {
    if (!image) return;
    records.set(`id:${image.id}`, image);
    records.set(`thumbnail:${image.thumbnail_path}`, image);
    records.set(`preview:${image.preview_path}`, image);
  }
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
            const key = `${kind}:${path}`;
            if (!records.has(key)) records.set(key, kind === 'thumbnail' ? imageRepository.getByThumbnailPath(path) : imageRepository.getByPreviewPath(path));
            image = records.get(key);
          } catch { /* Leave malformed URLs to the existing protected routes. */ }
        } else if (original) {
          const key = `id:${Number(original[1])}`;
          if (!records.has(key)) records.set(key, imageRepository.getById(Number(original[1])));
          image = records.get(key);
        }
        remember(image);
        const scoped = image && resolve(image.id, image);
        const url = scoped ? urlFor(scoped, kind) : null;
        urls.set(child, url ?? child);
        return [key, url ?? child];
      }
      return [key, visit(child)];
    }));
  }
  return visit(payload) as T;
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFingerprint,
  getMediaTypeFromExtension,
  getMimeTypeFromExtension,
  getPreviewRelativePath,
  getThumbnailRelativePath
} from '../src/utils/image-utils.js';

type AppConfigModule = typeof import('../src/config/env.js');
type GalleryServiceModule = typeof import('../src/services/gallery-service.js');
type RepositoriesModule = typeof import('../src/db/repositories.js');
type ModelsModule = typeof import('../src/types/models.js');

type ImageRecord = ModelsModule['ImageRecord'];

describe.sequential('recent feed ordering', () => {
  let tempRoot = '';
  let appConfig: AppConfigModule['appConfig'];
  let galleryService: GalleryServiceModule['galleryService'];
  let folderRepository: RepositoriesModule['folderRepository'];
  let imageRepository: RepositoriesModule['imageRepository'];
  let postRepository: RepositoriesModule['postRepository'];

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'insta-recent-feed-'));

    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATA_ROOT', path.join(tempRoot, 'data'));
    vi.stubEnv('GALLERY_ROOT', path.join(tempRoot, 'gallery'));
    vi.stubEnv('DB_DIR', path.join(tempRoot, 'db'));
    vi.stubEnv('THUMBNAILS_DIR', path.join(tempRoot, 'thumbnails'));
    vi.stubEnv('PREVIEWS_DIR', path.join(tempRoot, 'previews'));
  });

  beforeEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.mkdir(tempRoot, { recursive: true });

    vi.resetModules();

    ({ appConfig } = await import('../src/config/env.js'));
    ({ galleryService } = await import('../src/services/gallery-service.js'));
    ({ folderRepository, imageRepository, postRepository } = await import('../src/db/repositories.js'));

    await Promise.all([
      fs.mkdir(appConfig.galleryRoot, { recursive: true }),
      fs.mkdir(appConfig.thumbnailsDir, { recursive: true }),
      fs.mkdir(appConfig.previewsDir, { recursive: true })
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('keeps recent mode in strict reverse chronological order even when one folder has a burst', async () => {
    const julyNewer = await createIndexedImage('mi-11t', 'IMG_20220710_071100.jpg', Date.UTC(2022, 6, 10, 7, 11, 0));
    const julyOlder = await createIndexedImage('mi-11t', 'IMG_20220710_071048.jpg', Date.UTC(2022, 6, 10, 7, 10, 48));
    const octoberOlder = await createIndexedImage('note9', 'Samsung_Note9_20211019_103000.jpg', Date.UTC(2021, 9, 19, 10, 30, 0));

    const payload = galleryService.getFeed(1, 10, 'recent');

    expect(payload.mode).toBe('recent');
    expect(payload.items.map((item) => item.id)).toEqual([julyNewer.id, julyOlder.id, octoberOlder.id]);
  });

  it('orders album pages and adjacent posts by capture time rather than export time', async () => {
    const later = await createIndexedImage('trip', '1.jpg', 1000, 3000);
    const earlier = await createIndexedImage('trip', '2.jpg', 2000, 1000);
    const tied = await createIndexedImage('trip', '3.jpg', 3000, 1000);
    const folder = folderRepository.getBySlug('trip')!;
    const oldest = postRepository.listVisibleByFolder(folder.id, 1, 10, 'oldest');
    expect(oldest.map(item => item.filename)).toEqual([earlier.filename, tied.filename, later.filename]);
    expect(postRepository.listVisibleByFolder(folder.id, 2, 1, 'oldest')[0].filename).toBe(tied.filename);
    expect(postRepository.listVisibleByFolder(folder.id, 1, 10, 'newest').map(item => item.id)).toEqual(oldest.map(item => item.id).reverse());
    expect(postRepository.getPostDetail(oldest[1].id, 'oldest')).toMatchObject({ previousPostId: oldest[0].id, nextPostId: oldest[2].id });
  });

  it('reports album capture ranges without using export dates or cover images', async () => {
    const first = Date.UTC(2026, 9, 3, 18);
    const last = Date.UTC(2026, 9, 4, 19);
    const exported = Date.UTC(2026, 9, 10);
    await createIndexedImage('trip', 'first.jpg', exported, first);
    await createIndexedImage('trip', 'last.mp4', exported, last);
    await createIndexedImage('trip', 'unknown.jpg', exported, null);
    await createIndexedImage('trip', 'cover.jpg', exported, Date.UTC(2020, 0, 1));
    const album = galleryService.listFolders().find(folder => folder.slug === 'trip')!;
    expect(album.earliestTakenAt).toBe(first);
    expect(album.latestTakenAt).toBe(last);
    await createIndexedImage('unknown', 'photo.jpg', exported, null);
    const unknown = galleryService.listFolders().find(folder => folder.slug === 'unknown')!;
    expect(unknown.earliestTakenAt).toBeNull();
    expect(unknown.latestTakenAt).toBeNull();
  });

  async function createIndexedImage(folderPath: string, filename: string, timestamp: number, captureTimestamp: number | null = timestamp): Promise<ImageRecord> {
    const folder = folderRepository.upsert({
      slug: folderPath.replaceAll('/', '-'),
      name: path.posix.basename(folderPath),
      folderPath
    });
    const relativePath = `${folderPath}/${filename}`;
    const absolutePath = path.join(appConfig.galleryRoot, relativePath);
    const extension = path.extname(filename).toLowerCase();
    const mediaType = getMediaTypeFromExtension(extension);
    const thumbnailPath = getThumbnailRelativePath(relativePath);
    const previewPath = getPreviewRelativePath(relativePath, mediaType);

    return imageRepository.upsert({
      folderId: folder.id,
      filename,
      extension,
      relativePath,
      absolutePath,
      fileSize: 2_048,
      width: 1600,
      height: 1200,
      mediaType,
      mimeType: getMimeTypeFromExtension(extension),
      durationMs: null,
      isAnimated: false,
      fingerprint: createFingerprint(relativePath, 2_048, timestamp),
      mtimeMs: timestamp,
      firstSeenAt: new Date(timestamp).toISOString(),
      sortTimestamp: timestamp,
      takenAt: captureTimestamp,
      takenAtSource: captureTimestamp === null ? null : 'exif',
      exifJson: '{}',
      thumbnailPath,
      previewPath
    });
  }
});

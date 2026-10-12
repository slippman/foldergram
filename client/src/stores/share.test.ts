import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../api/gallery';
import { useShareStore } from './share';
import type { SharedFolderImagesPayload, SharedImageDetail } from '../types/api';

beforeEach(() => setActivePinia(createPinia()));
it('loads an album page and a zoom photo independently without cancelling either', async () => {
  let resolveFolder!: (value: SharedFolderImagesPayload) => void;
  let resolvePhoto!: (value: SharedImageDetail) => void;
  vi.spyOn(api, 'fetchSharedFolderImages').mockReturnValue(new Promise(resolve => { resolveFolder = resolve; }));
  vi.spyOn(api, 'fetchSharedPost').mockReturnValue(new Promise(resolve => { resolvePhoto = resolve; }));
  const store = useShareStore();
  const album = store.loadFolder('family');
  const zoom = store.loadImage(7);
  resolveFolder({ folder: { id: 1, slug: 'family', name: 'Family', description: null, imageCount: 1, postCount: 1, videoCount: 0, avatarThumbnailUrl: null, sortTimestamp: 0 }, items: [], page: 1, limit: 24, total: 0, hasMore: false });
  await album;
  expect(store.folder?.slug).toBe('family');
  expect(store.loading).toBe(false);
  expect(store.loadingImage).toBe(true);
  resolvePhoto({ id: 7, folderId: 1, folderSlug: 'family', folderName: 'Family', filename: 'photo.jpg', caption: null, mediaType: 'image', mimeType: 'image/jpeg', width: 100, height: 100, durationMs: null, thumbnailUrl: '/api/share/images/7/thumbnail', previewUrl: '/api/share/images/7/preview', sortTimestamp: 0, nextImageId: null, previousImageId: null });
  await zoom;
  expect(store.image?.id).toBe(7);
  expect(store.loadingImage).toBe(false);
  vi.restoreAllMocks();
});

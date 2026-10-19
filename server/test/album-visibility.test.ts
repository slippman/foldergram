import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTestApp as request } from './http-test-utils.js';

describe.sequential('album visibility boundaries', () => {
  let root: string;
  let app: express.Application;
  let repositories: typeof import('../src/db/repositories.js');
  let scope: typeof import('../src/services/album-access-context.js');
  let gallery: typeof import('../src/services/gallery-service.js');
  let admin: string;
  let viewer: string;
  let hiddenImage: number;
  let hiddenPost: number;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'album-visibility-'));
    vi.stubEnv('NODE_ENV', 'test');
    for (const [key, directory] of Object.entries({ DATA_ROOT: 'data', GALLERY_ROOT: 'gallery', DB_DIR: 'db', THUMBNAILS_DIR: 'thumbnails', PREVIEWS_DIR: 'previews' })) {
      vi.stubEnv(key, path.join(root, directory));
    }
  });
  beforeEach(async () => {
    (await import('../src/db/database.js')).databaseManager.close();
    await fs.rm(root, { recursive: true, force: true });
    await Promise.all(['gallery', 'db', 'thumbnails', 'previews'].map(directory => fs.mkdir(path.join(root, directory), { recursive: true })));
    vi.resetModules();
    repositories = await import('../src/db/repositories.js');
    scope = await import('../src/services/album-access-context.js');
    gallery = await import('../src/services/gallery-service.js');
    const { authService } = await import('../src/services/auth-service.js');
    authService.setAdminPassword('admin-password');
    authService.setViewerAccess('password', 'viewer-password');
    const session = (role: 'admin' | 'viewer') => {
      const response = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
      authService.setAuthenticatedSession(response as any, { secure: false, get: () => undefined } as any, role);
      const [name, value] = response.cookie.mock.calls.at(-1)!;
      return `${name}=${value}`;
    };
    admin = session('admin'); viewer = session('viewer');
    app = (await import('../src/app.js')).createApp();
    for (const slug of ['visible', 'hidden']) {
      const folder = repositories.folderRepository.upsert({ slug, name: slug, folderPath: slug });
      for (const extension of ['jpg', 'mp4']) {
        const relativePath = `${slug}/photo.${extension}`;
        const image = repositories.imageRepository.upsert({
          folderId: folder.id, filename: `photo.${extension}`, extension: `.${extension}`,
          relativePath, absolutePath: path.join(root, 'gallery', relativePath), fileSize: 10,
          width: 100, height: 100, mediaType: extension === 'jpg' ? 'image' : 'video',
          mimeType: extension === 'jpg' ? 'image/jpeg' : 'video/mp4', durationMs: extension === 'jpg' ? null : 1000,
          fingerprint: relativePath, mtimeMs: 1000, firstSeenAt: new Date().toISOString(),
          sortTimestamp: Date.now() - 400 * 86400000, takenAt: Date.now() - 400 * 86400000,
          takenAtSource: 'exif', exifJson: '{}', thumbnailPath: `${slug}/${extension}.webp`, previewPath: `${slug}/${extension}.webp`
        });
        await fs.mkdir(path.join(root, 'thumbnails', slug), { recursive: true });
        await fs.mkdir(path.join(root, 'previews', slug), { recursive: true });
        await fs.writeFile(path.join(root, 'thumbnails', image.thumbnail_path), 'derivative');
        await fs.writeFile(path.join(root, 'previews', image.preview_path), 'derivative');
        if (slug === 'hidden' && extension === 'jpg') {
          hiddenImage = image.id;
          hiddenPost = repositories.postRepository.findByImageId(image.id)!.id;
        }
      }
    }
    repositories.folderRepository.setShareMode('hidden', 'link-only');
  });
  afterAll(async () => {
    (await import('../src/db/database.js')).databaseManager.close();
    vi.unstubAllEnvs(); vi.resetModules();
    await fs.rm(root, { recursive: true, force: true });
  });
  const get = (url: string, cookie = viewer) => request(app, 'GET', url, { Cookie: cookie });

  it('defaults new albums to library and preserves a choice across index upserts', () => {
    expect(repositories.folderRepository.getBySlug('visible')!.share_mode).toBe('library');
    repositories.folderRepository.upsert({ slug: 'hidden', name: 'Renamed', folderPath: 'hidden' });
    expect(repositories.folderRepository.getBySlug('hidden')!.share_mode).toBe('link-only');
  });

  it('excludes hidden albums from viewers but keeps them manageable by admins', async () => {
    expect((await get('/api/folders')).body.items.map((folder: any) => folder.slug)).toEqual(['visible']);
    expect((await get('/api/folders', admin)).body.items.map((folder: any) => folder.slug).sort()).toEqual(['hidden', 'visible']);
    expect((await get('/api/folders/hidden')).status).toBe(404);
    expect((await get('/api/folders/hidden', admin)).status).toBe(200);
  });

  it('excludes link-only posts from every feed mode, search and reels even for admins', async () => {
    for (const cookie of [viewer, admin]) {
      for (const url of ['/api/feed?mode=recent', '/api/feed?mode=random', '/api/feed?mode=rediscover', '/api/feed/search?q=photo', '/api/reels?mode=recent', '/api/FEED?mode=recent']) {
        const response = await get(url, cookie);
        expect(response.status, url).toBe(200);
        expect(response.body.items.length, url).toBeGreaterThan(0);
        expect(response.body.items.every((item: any) => item.folderSlug === 'visible'), url).toBe(true);
      }
    }
    // Internal/administrator callers must not accidentally broaden a discovery service.
    expect(scope.withAlbumAccess(true, () => gallery.galleryService.getFeed(1, 20, 'recent')).total).toBe(2);
  });

  it('blocks direct post, original, derivative, story and collection routes', async () => {
    for (const url of [`/api/posts/${hiddenPost}`, `/api/images/${hiddenImage}`, `/api/originals/${hiddenImage}`, '/api/folders/hidden/images', '/api/folders/hidden/stories', `/api/posts/${hiddenPost}/collections`, '/thumbnails/hidden/jpg.webp', '/previews/hidden/jpg.webp']) {
      expect((await get(url)).status, url).toBe(404);
    }
    for (const url of [`/api/posts/${hiddenPost}/like`, `/api/posts/${hiddenPost}/save`]) {
      expect((await request(app, 'POST', url, { Cookie: viewer, 'x-foldergram-intent': '1' })).status, url).toBe(404);
    }
    expect((await get('/thumbnails/visible/jpg.webp')).status).toBe(200);
    expect((await get('/thumbnails/hidden/jpg.webp', admin)).status).toBe(200);
  });

  it('requires admin and a trusted origin for updates, validates modes and can restore library visibility', async () => {
    const url = '/api/admin/folders/hidden/share-mode';
    expect((await request(app, 'PATCH', url, { Cookie: viewer, 'x-foldergram-intent': '1' }, { shareMode: 'library' })).status).toBe(403);
    expect((await request(app, 'PATCH', url, { Cookie: admin, 'x-foldergram-intent': '1', Origin: 'https://evil.example' }, { shareMode: 'library' })).status).toBe(403);
    expect((await request(app, 'PATCH', url, { Cookie: admin, 'x-foldergram-intent': '1' }, { shareMode: 'public' })).status).toBe(400);
    const response = await request(app, 'PATCH', url, { Cookie: admin, 'x-foldergram-intent': '1' }, { shareMode: 'library' });
    expect(response.status).toBe(200);
    expect(response.body.shareMode).toBe('library');
    expect((await get('/api/folders/hidden')).status).toBe(200);
    expect((await get('/api/feed?mode=recent', admin)).body.total).toBe(4);
  });

  it('allows valid scoped shares without granting library access or another album', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    repositories.folderRepository.upsert({ slug: 'hidden-other', name: 'Other', folderPath: 'hidden-other' });
    repositories.folderRepository.setShareMode('hidden-other', 'link-only');
    const link = folderShareService.createLink('hidden', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('hidden', link.rawToken)!;
    const response = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(response as any, { secure: false, get: () => undefined } as any, grant);
    const [name, value] = response.cookie.mock.calls.at(-1)!;
    const shareCookie = `${name}=${value}`;
    for (const cookie of [shareCookie, `${viewer}; ${shareCookie}`]) {
      expect((await get('/api/share/folders/hidden', cookie)).status).toBe(200);
      expect((await get('/api/share/folders/hidden/images', cookie)).body.items.length).toBe(2);
      expect((await get(`/api/share/images/${hiddenImage}`, cookie)).status).toBe(200);
      expect([401, 403]).toContain((await get('/api/share/folders/hidden-other', cookie)).status);
      expect([401, 404]).toContain((await get('/api/folders/hidden', cookie)).status);
    }
  });

  it('resolves child carousel/story ownership before allowing direct media', async () => {
    const { canReadAlbum } = await import('../src/services/album-access-service.js');
    const owner = repositories.folderRepository.getBySlug('hidden')!;
    for (const role of ['carousel_source', 'story_source'] as const) {
      const child = repositories.folderRepository.upsert({ slug: role, name: role, folderPath: `hidden/${role}`, role,
        carouselOwnerFolderId: role === 'carousel_source' ? owner.id : null,
        storyOwnerFolderId: role === 'story_source' ? owner.id : null });
      expect(scope.withAlbumAccess(false, () => canReadAlbum(child.id))).toBe(false);
      expect(scope.withAlbumAccess(true, () => canReadAlbum(child.id))).toBe(true);
    }
  });

  it('excludes hidden-only places, liked posts and collection previews from discovery', async () => {
    const place = repositories.placeRepository.upsertCity({ geonamesId: 123, displayName: 'Hidden city', slug: 'hidden-city', latitude: 1, longitude: 1, cityName: 'Hidden city' });
    const { databaseManager } = await import('../src/db/database.js');
    databaseManager.connection.prepare('UPDATE posts SET place_id = ? WHERE id = ?').run(place.id, hiddenPost);
    repositories.likeRepository.upsert(hiddenPost);
    repositories.collectionRepository.saveToDefault(hiddenPost);
    for (const cookie of [viewer, admin]) {
      expect((await get('/api/places', cookie)).body.items).toEqual([]);
      expect((await get('/api/places/hidden-city', cookie)).status).toBe(404);
      expect((await get('/api/places/hidden-city/images', cookie)).status).toBe(404);
      expect((await get('/api/likes', cookie)).body.items).toEqual([]);
      const collections = (await get('/api/collections', cookie)).body.items;
      expect(collections.every((item: any) => item.itemCount === 0)).toBe(true);
      expect(JSON.stringify(collections)).not.toContain('hidden/jpg.webp');
      const rail = await get('/api/feed/moments', cookie);
      expect(JSON.stringify(rail.body)).not.toContain('hidden/jpg.webp');
    }
  });

  it('keeps concurrent request scopes isolated, including across awaits', async () => {
    const values = await Promise.all([true, false].map(flag => scope.withAlbumAccess(flag, async () => {
      await new Promise(resolve => setTimeout(resolve, flag ? 5 : 1));
      return repositories.folderRepository.getAllSummaries().map(folder => folder.slug).sort();
    })));
    expect(values).toEqual([['hidden', 'visible'], ['visible']]);
  });
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import sharp from 'sharp';

import { requestTestApp as requestApp } from './http-test-utils.js';

type DatabaseModule = typeof import('../src/db/database.js');
type AuthServiceModule = typeof import('../src/services/auth-service.js');

describe.sequential('folder share API routes', () => {
  let tempRoot = '';
  let app: express.Application;
  let authService: AuthServiceModule['authService'];

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foldergram-share-routes-'));

    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATA_ROOT', path.join(tempRoot, 'data'));
    vi.stubEnv('GALLERY_ROOT', path.join(tempRoot, 'gallery'));
    vi.stubEnv('DB_DIR', path.join(tempRoot, 'db'));
    vi.stubEnv('THUMBNAILS_DIR', path.join(tempRoot, 'thumbnails'));
    vi.stubEnv('PREVIEWS_DIR', path.join(tempRoot, 'previews'));
    vi.stubEnv('MEDIA_CACHE_ENABLED', 'true');
  });

  beforeEach(async () => {
    try {
      const dbModule: DatabaseModule = await import('../src/db/database.js');
      dbModule.databaseManager.close();
    } catch {
      // Ignore
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(path.join(tempRoot, 'db'), { recursive: true }),
      fs.mkdir(path.join(tempRoot, 'gallery'), { recursive: true }),
      fs.mkdir(path.join(tempRoot, 'thumbnails'), { recursive: true }),
      fs.mkdir(path.join(tempRoot, 'previews'), { recursive: true })
    ]);

    vi.resetModules();
    const { createApp } = await import('../src/app.js');
    ({ authService } = await import('../src/services/auth-service.js'));
    const { folderRepository, imageRepository, maintenanceRepository, postRepository } = await import('../src/db/repositories.js');

    maintenanceRepository.resetLibraryIndex();
    authService.setAdminPassword('admin12345');
    authService.setViewerAccess('password', 'viewer12345');

    const folderA = folderRepository.upsert({ slug: 'folder-a', name: 'Folder A', folderPath: 'folder-a' });
    const folderB = folderRepository.upsert({ slug: 'folder-b', name: 'Folder B', folderPath: 'folder-b' });

    imageRepository.upsert({
      folderId: folderA.id,
      filename: 'image-a.jpg',
      extension: '.jpg',
      relativePath: 'folder-a/image-a.jpg',
      absolutePath: path.join(tempRoot, 'gallery', 'folder-a', 'image-a.jpg'),
      fileSize: 1024,
      width: 800,
      height: 600,
      mediaType: 'image',
      mimeType: 'image/jpeg',
      durationMs: null,
      fingerprint: 'fp-a',
      mtimeMs: Date.now(),
      firstSeenAt: new Date().toISOString(),
      sortTimestamp: Date.now(),
      takenAt: Date.now(),
      takenAtSource: 'mtime',
      thumbnailPath: 'folder-a/image-a.webp',
      previewPath: 'folder-a/image-a.webp',
      exifJson: JSON.stringify({ latitude: 37.7749, longitude: -122.4194, cameraMake: 'Canon' })
    });

    imageRepository.upsert({
      folderId: folderB.id,
      filename: 'image-b.jpg',
      extension: '.jpg',
      relativePath: 'folder-b/image-b.jpg',
      absolutePath: path.join(tempRoot, 'gallery', 'folder-b', 'image-b.jpg'),
      fileSize: 2048,
      width: 1200,
      height: 900,
      mediaType: 'image',
      mimeType: 'image/jpeg',
      durationMs: null,
      fingerprint: 'fp-b',
      mtimeMs: Date.now(),
      firstSeenAt: new Date().toISOString(),
      sortTimestamp: Date.now(),
      takenAt: Date.now(),
      takenAtSource: 'mtime',
      thumbnailPath: 'folder-b/image-b.webp',
      previewPath: 'folder-b/image-b.webp',
      exifJson: null
    });

    const carouselSource = folderRepository.upsert({
      slug: 'folder-a-carousel-trip',
      name: 'Trip',
      folderPath: 'folder-a/carousels/trip',
      role: 'carousel_source',
      carouselOwnerFolderId: folderA.id
    });
    const carouselItems = [
      imageRepository.upsert({
        folderId: carouselSource.id,
        filename: '01-image.jpg',
        extension: '.jpg',
        relativePath: 'folder-a/carousels/trip/01-image.jpg',
        absolutePath: path.join(tempRoot, 'gallery', 'folder-a', 'carousels', 'trip', '01-image.jpg'),
        fileSize: 3001,
        width: 1400,
        height: 900,
        mediaType: 'image',
        mimeType: 'image/jpeg',
        durationMs: null,
        fingerprint: 'fp-carousel-image',
        mtimeMs: Date.now(),
        firstSeenAt: new Date().toISOString(),
        sortTimestamp: Date.now() + 1000,
        takenAt: Date.now(),
        takenAtSource: 'mtime',
        thumbnailPath: 'folder-a/carousels/trip/01-image.webp',
        previewPath: 'folder-a/carousels/trip/01-image.webp',
        exifJson: JSON.stringify({ latitude: 51.5, longitude: -0.1, cameraModel: 'Private Camera' })
      }),
      imageRepository.upsert({
        folderId: carouselSource.id,
        filename: '02-animated.gif',
        extension: '.gif',
        relativePath: 'folder-a/carousels/trip/02-animated.gif',
        absolutePath: path.join(tempRoot, 'gallery', 'folder-a', 'carousels', 'trip', '02-animated.gif'),
        fileSize: 3002,
        width: 900,
        height: 900,
        mediaType: 'image',
        mimeType: 'image/gif',
        durationMs: 1200,
        isAnimated: true,
        fingerprint: 'fp-carousel-animated',
        mtimeMs: Date.now(),
        firstSeenAt: new Date().toISOString(),
        sortTimestamp: Date.now() + 1000,
        takenAt: Date.now(),
        takenAtSource: 'mtime',
        thumbnailPath: 'folder-a/carousels/trip/02-animated.webp',
        previewPath: 'folder-a/carousels/trip/02-animated.gif',
        exifJson: JSON.stringify({ cameraMake: 'Private Make' })
      }),
      imageRepository.upsert({
        folderId: carouselSource.id,
        filename: '03-video.mp4',
        extension: '.mp4',
        relativePath: 'folder-a/carousels/trip/03-video.mp4',
        absolutePath: path.join(tempRoot, 'gallery', 'folder-a', 'carousels', 'trip', '03-video.mp4'),
        fileSize: 3003,
        width: 1920,
        height: 1080,
        mediaType: 'video',
        mimeType: 'video/mp4',
        durationMs: 5000,
        fingerprint: 'fp-carousel-video',
        mtimeMs: Date.now(),
        firstSeenAt: new Date().toISOString(),
        sortTimestamp: Date.now() + 1000,
        takenAt: Date.now(),
        takenAtSource: 'mtime',
        thumbnailPath: 'folder-a/carousels/trip/03-video.webp',
        previewPath: 'folder-a/carousels/trip/03-video.mp4',
        playbackStrategy: 'original',
        exifJson: null
      })
    ];
    postRepository.upsertPostWithItems({
      folderId: folderA.id,
      sourcePath: 'folder-a/carousels/trip',
      postType: 'carousel',
      sortTimestamp: Date.now() + 1000,
      takenAt: Date.now(),
      takenAtSource: 'mtime'
    }, carouselItems.map((image, index) => ({ imageId: image.id, position: index + 1 })));

    await fs.mkdir(path.join(tempRoot, 'gallery', 'folder-a'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'gallery', 'folder-b'), { recursive: true });

    const tinyJpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } }
    })
      .jpeg()
      .toBuffer();

    await fs.writeFile(path.join(tempRoot, 'gallery', 'folder-a', 'image-a.jpg'), tinyJpeg);
    await fs.writeFile(path.join(tempRoot, 'gallery', 'folder-b', 'image-b.jpg'), tinyJpeg);

    // Create dummy derivative files on disk
    await fs.mkdir(path.join(tempRoot, 'thumbnails', 'folder-a'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'thumbnails', 'folder-b'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'thumbnails', 'folder-a', 'image-a.webp'), 'dummy-thumb-a');
    await fs.writeFile(path.join(tempRoot, 'thumbnails', 'folder-b', 'image-b.webp'), 'dummy-thumb-b');

    await fs.mkdir(path.join(tempRoot, 'previews', 'folder-a'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'previews', 'folder-b'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'previews', 'folder-a', 'image-a.webp'), 'dummy-preview-a');
    await fs.writeFile(path.join(tempRoot, 'previews', 'folder-b', 'image-b.webp'), 'dummy-preview-b');

    app = createApp();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    try {
      const dbModule: DatabaseModule = await import('../src/db/database.js');
      dbModule.databaseManager.close();
    } catch {
      // Ignore
    }
    vi.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('short links preserve previews and grants through slug changes, expiry and revocation', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { folderRepository } = await import('../src/db/repositories.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const shortUrl = folderShareService.copyLink('folder-a', link.link.id)!;
    const response = await requestApp(app, 'GET', shortUrl);
    expect(response.status).toBe(302);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('set-cookie')).toBeNull();
    const destination = new URL(response.headers.get('location')!, 'http://localhost');
    const preview = await requestApp(app, 'GET', destination.pathname + destination.search);
    expect(preview.body).toContain('og:title');
    expect(preview.body).toContain('/share-preview/folder-a/cover.jpg');
    expect((await requestApp(app, 'GET', '/api/share/folders/folder-a')).status).toBe(401);
    const token = new URLSearchParams(destination.hash.slice(1)).get('token');
    const unlock = await requestApp(app, 'POST', '/api/share/folders/folder-a/unlock-link', { 'X-Foldergram-Intent': '1' }, { token });
    expect(unlock.status).toBe(200);
    expect(unlock.headers.get('set-cookie')).toContain('foldergram_share_session');
    expect((await requestApp(app, 'GET', shortUrl.slice(0, -1) + (shortUrl.endsWith('A') ? 'B' : 'A'))).status).toBe(404);
    // Identity remains the folder ID, so copying the same link still works after a slug refresh.
    folderRepository.save({ slug: 'seths-birthday', name: "Seth's Birthday", folderPath: 'folder-a' });
    const renamed = await requestApp(app, 'GET', shortUrl);
    expect(renamed.status).toBe(302);
    expect(renamed.headers.get('location')).toContain('/share/seths-birthday?');
    expect(folderShareService.copyLink('seths-birthday', link.link.id)).toBe(shortUrl);
    folderShareService.revokeLink('seths-birthday', link.link.id);
    expect((await requestApp(app, 'GET', shortUrl)).status).toBe(404);
    const expiring = folderShareService.createLink('seths-birthday', { expiresAt: new Date(Date.now() + 60_000) })!;
    const expiresUrl = folderShareService.copyLink('seths-birthday', expiring.link.id)!;
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000);
    try { expect((await requestApp(app, 'GET', expiresUrl)).status).toBe(404); }
    finally { now.mockRestore(); }
  });

  it('exposes only the cover and escaped title through an active preview credential', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { folderRepository } = await import('../src/db/repositories.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const preview = folderShareService.createPreviewToken(link.link.id);
    const folder = folderRepository.getNormalBySlug('folder-a')!;
    // Album names are untrusted text, including in crawler metadata.
    folderRepository.upsert({ slug: 'folder-a', name: 'Trip <script>alert(1)</script>', folderPath: 'folder-a' });
    const page = await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain('og:title');
    expect(page.body).toContain('Trip &lt;script&gt;');
    expect(page.body).not.toContain('Trip <script>');
    expect(page.body).toContain(`/share-preview/folder-a/cover.jpg?preview=${preview}`);
    expect(page.headers.get('referrer-policy')).toBe('no-referrer');
    const { galleryService } = await import('../src/services/gallery-service.js');
    const coverImage = galleryService.getShareDerivativeImage(galleryService.getFolderBySlug('folder-a')!.avatarImageId!)!;
    const coverPath = path.join(tempRoot, 'thumbnails', coverImage.thumbnail_path);
    await fs.mkdir(path.dirname(coverPath), { recursive: true });
    await sharp({ create: { width: 32, height: 32, channels: 3, background: '#334455' } }).webp().toFile(coverPath);
    const cover = await requestApp(app, 'GET', `/share-preview/folder-a/cover?preview=${preview}`);
    expect(cover.status).toBe(200);
    expect(cover.headers.get('content-type')).toContain('image/jpeg');
    expect((await sharp(cover.bytes).metadata()).format).toBe('jpeg');
    expect(cover.headers.get('cache-control')).toContain('no-store');
    expect(page.body).toContain('property="og:image:type" content="image/jpeg"');
    const repeatedCover = await requestApp(app, 'GET', `/share-preview/folder-a/cover.jpg?preview=${preview}`);
    expect(repeatedCover.status).toBe(200);
    expect(repeatedCover.headers.get('content-type')).toContain('image/jpeg');
    expect(repeatedCover.bytes.equals(cover.bytes)).toBe(true);
    expect((await requestApp(app, 'GET', `/api/share/folders/folder-a?preview=${preview}`)).status).toBe(401);
    expect(folderShareService.verifyLinkToken('folder-a', preview)).toBeNull();
    expect((await requestApp(app, 'GET', `/share-preview/folder-b/cover?preview=${preview}`)).status).toBe(404);
    expect((await requestApp(app, 'GET', `/share-preview/folder-a/cover?preview=${preview}x`)).status).toBe(404);
    expect((await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`, { Host: 'evil.example' })).body).not.toContain('og:image');
    const { appConfig } = await import('../src/config/env.js');
    const originalOrigins = [...appConfig.csrfTrustedOrigins];
    appConfig.csrfTrustedOrigins.push('https://photos.example.test');
    try {
      const rewrittenHostPage = await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`, { Host: 'backend:4141' });
      expect(rewrittenHostPage.body).toContain('https://photos.example.test/share-preview/folder-a/cover');
      const spoofedHostPage = await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`, {
        Host: 'evil.example', 'X-Forwarded-Host': 'evil.example'
      });
      expect(spoofedHostPage.body).toContain('https://photos.example.test/share-preview/folder-a/cover');
      expect(spoofedHostPage.body).not.toContain('https://evil.example');
      const replacementTitle = 'Trip $& $` $\' <script>test</script>';
      folderRepository.upsert({ slug: 'folder-a', name: replacementTitle, folderPath: 'folder-a' });
      const literalTitlePage = await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`);
      expect(literalTitlePage.body).toContain('<title>Trip $&amp; $` $&#39; &lt;script&gt;test&lt;/script&gt;</title>');
      expect(literalTitlePage.body).toContain('property="og:title" content="Trip $&amp; $` $&#39; &lt;script&gt;test&lt;/script&gt;"');
      expect(literalTitlePage.body.match(/<!doctype html>/gi)).toHaveLength(1);
      const { appSettingsRepository } = await import('../src/db/repositories.js');
      appSettingsRepository.set('folder.display_theme', 'cinema');
      const cinemaTitlePage = await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`);
      expect(cinemaTitlePage.body).toContain('<title>Trip $&amp; $` $&#39; &lt;script&gt;test&lt;/script&gt; | UnReeled Photos</title>');
      appSettingsRepository.set('folder.display_theme', 'classic');
    } finally {
      appConfig.csrfTrustedOrigins.splice(0, appConfig.csrfTrustedOrigins.length, ...originalOrigins);
    }
    folderShareService.revokeLink('folder-a', link.link.id);
    expect((await requestApp(app, 'GET', `/share-preview/folder-a/cover?preview=${preview}`)).status).toBe(404);
    expect((await requestApp(app, 'GET', `/share/folder-a?preview=${preview}`)).body).not.toContain('og:title');
    const expired = folderShareService.createLink('folder-a', { expiresAt: new Date(Date.now() - 1000) })!;
    expect(folderShareService.getPreviewFolder('folder-a', folderShareService.createPreviewToken(expired.link.id))).toBeNull();
    expect(folder.id).toBe(link.folder.id);
  });

  it('lets only admins re-copy an active link without replacing its token', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const copyPath = `/api/admin/folders/folder-a/share-links/${link.link.id}/copy`;
    const intent = { 'x-foldergram-intent': '1' };
    expect((await requestApp(app, 'POST', copyPath, intent)).status).toBe(401);
    const mockResponse = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(mockResponse as any, { secure: false, get: () => undefined } as any, 'viewer');
    const viewerCookie = mockResponse.cookie.mock.calls.at(-1)?.[1];
    expect((await requestApp(app, 'POST', copyPath, { ...intent, Cookie: `foldergram_session=${viewerCookie}` })).status).toBe(403);
    authService.setAuthenticatedSession(mockResponse as any, { secure: false, get: () => undefined } as any, 'admin');
    const cookie = mockResponse.cookie.mock.calls.at(-1)?.[1];
    const headers = { ...intent, Cookie: `foldergram_session=${cookie}` };
    const copy = await requestApp(app, 'POST', copyPath, headers);
    expect(copy.status).toBe(200);
    expect(copy.headers.get('cache-control')).toContain('no-store');
    expect(copy.body.shareUrl).toMatch(/^\/s\/[0-9a-z]+-[A-Za-z0-9_-]{16}$/);
    const shortened = await requestApp(app, 'GET', copy.body.shareUrl);
    expect(shortened.status).toBe(302);
    expect(shortened.headers.get('location')).toContain(`#token=${link.rawToken}`);
    expect(shortened.headers.get('cache-control')).toContain('no-store');
    expect(shortened.headers.get('set-cookie')).toBeNull();
    expect((await requestApp(app, 'POST', copyPath, headers)).body.shareUrl).toBe(copy.body.shareUrl);
    expect((await requestApp(app, 'POST', copyPath.replace('folder-a', 'folder-b'), headers)).status).toBe(404);
    expect((await requestApp(app, 'POST', copyPath, { ...headers, Origin: 'https://evil.example' })).status).toBe(403);
    folderShareService.revokeLink('folder-a', link.link.id);
    expect((await requestApp(app, 'POST', copyPath, headers)).status).toBe(404);
  });

  it('rejects share session cookies on admin endpoints with 401 and viewer cookies with 403', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { folderRepository } = await import('../src/db/repositories.js');
    const folder = folderRepository.getNormalBySlug('folder-a')!;
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    // Generate share cookie
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    // Anonymous request -> 401
    const anonRes = await requestApp(app, 'GET', '/api/admin/stats');
    expect(anonRes.status).toBe(401);

    // Share cookie request -> 401
    const shareRes = await requestApp(app, 'GET', '/api/admin/stats', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(shareRes.status).toBe(401);

    // Viewer auth cookie request -> 403
    const viewerResMock = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(viewerResMock as any, { secure: false, get: () => undefined } as any, 'viewer');
    const viewerCookie = viewerResMock.cookie.mock.calls.at(-1)?.[1];

    const viewerRes = await requestApp(app, 'GET', '/api/admin/stats', {
      Cookie: `foldergram_session=${viewerCookie}`
    });
    expect(viewerRes.status).toBe(403);
  });

  it('rejects cross-folder derivative access', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    // Access image 1 (in folder-a) -> allowed (200)
    const allowedRes = await requestApp(app, 'GET', '/api/share/images/1/thumbnail', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(allowedRes.status).toBe(200);

    // Access image 2 (in folder-b) -> rejected (401)
    const rejectedRes = await requestApp(app, 'GET', '/api/share/images/2/thumbnail', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(rejectedRes.status).toBe(401);
  });

  it('serves exact originals and HEAD metadata only within an active album grant', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const headers = { Cookie: `foldergram_share_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    const expected = await fs.readFile(path.join(tempRoot, 'gallery', 'folder-a', 'image-a.jpg'));
    const allowed = await requestApp(app, 'GET', '/api/share/images/1/original', headers);
    expect(allowed.status).toBe(200);
    expect(allowed.bytes).toEqual(expected);
    expect(allowed.headers.get('Content-Disposition')).toContain('image-a.jpg');
    expect(allowed.headers.get('Cache-Control')).toBe('private, no-store');
    expect(allowed.headers.get('Vary')).toContain('Cookie');
    const head = await requestApp(app, 'HEAD', '/api/share/images/1/original', headers);
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe(String(expected.length));
    expect(head.headers.get('Content-Type')).toContain('image/jpeg');
    expect(head.bytes.length).toBe(0);
    const range = await requestApp(app, 'GET', '/api/share/images/1/original', { ...headers, Range: 'bytes=0-9' });
    expect(range.status).toBe(206);
    expect(range.bytes).toEqual(expected.subarray(0, 10));
    for (const method of ['GET', 'HEAD']) {
      expect((await requestApp(app, method, '/api/share/images/1/original')).status).toBe(401);
      expect((await requestApp(app, method, '/api/share/images/2/original', headers)).status).toBe(401);
      expect((await requestApp(app, method, '/api/originals/1?download=1', headers)).status).toBe(401);
    }
    // A crawler cover token never grants originals.
    const preview = folderShareService.createPreviewToken(link.link.id);
    expect((await requestApp(app, 'GET', `/api/share/images/1/original?preview=${preview}`)).status).toBe(401);
    folderShareService.revokeLink('folder-a', link.link.id);
    expect((await requestApp(app, 'GET', '/api/share/images/1/original', headers)).status).toBe(401);
    expect((await requestApp(app, 'HEAD', '/api/share/images/1/original', headers)).status).toBe(401);
  });

  it('uses the carousel owning album grant for original downloads', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { imageRepository } = await import('../src/db/repositories.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const headers = { Cookie: `foldergram_share_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    const image = imageRepository.getById(5)!;
    await fs.mkdir(path.dirname(image.absolute_path), { recursive: true });
    await fs.writeFile(image.absolute_path, 'original movie bytes');
    const allowed = await requestApp(app, 'GET', '/api/share/images/5/original', headers);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toBe('original movie bytes');
    expect(allowed.headers.get('Content-Type')).toContain('video/mp4');
    expect(allowed.headers.get('Content-Disposition')).toContain('03-video.mp4');
    await fs.unlink(image.absolute_path);
    expect((await requestApp(app, 'GET', '/api/share/images/5/original', headers)).status).toBe(404);
  });

  it('rejects an expired link session for both original HEAD and GET requests', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const now = Date.now();
    const link = folderShareService.createLink('folder-a', { expiresAt: new Date(now + 60_000) })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const headers = { Cookie: `foldergram_share_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    try {
      for (const method of ['GET', 'HEAD']) {
        const denied = await requestApp(app, method, '/api/share/images/1/original', headers);
        expect(denied.status).toBe(401);
        expect(denied.headers.get('Cache-Control')).toBe('private, no-store');
      }
    } finally { clock.mockRestore(); }
  });

  it('caches asset-specific shared media for 24 hours while keeping metadata and old routes private', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { galleryService } = await import('../src/services/gallery-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const headers = { Cookie: `foldergram_share_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    const detail = await requestApp(app, 'GET', '/api/share/images/1', headers);
    expect(detail.headers.get('Cache-Control')).toBe('private, no-store');
    const preview = detail.body.previewUrl as string;
    const thumbnail = detail.body.thumbnailUrl as string;
    expect(preview).toMatch(/^\/api\/share\/media\/[^/]+\/preview\.webp$/);
    const folder = await requestApp(app, 'GET', '/api/share/folders/folder-a', headers);
    expect(folder.body.avatarThumbnailUrl).toMatch(/^\/api\/share\/media\/[^/]+\/thumbnail\.webp$/);
    expect((await requestApp(app, 'GET', '/api/share/images/1', headers)).body.previewUrl).toBe(preview);
    const cached = await requestApp(app, 'GET', thumbnail);
    expect(cached.status).toBe(200);
    expect(cached.body).toBe('dummy-thumb-a');
    expect(cached.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400');
    expect(cached.headers.get('Vary') ?? '').not.toContain('Cookie');
    expect(cached.headers.get('Set-Cookie')).toBeNull();
    const original = preview.replace(/\/preview\.[a-z0-9]+$/, '/original');
    const head = await requestApp(app, 'HEAD', original);
    expect(head.status).toBe(200);
    expect(head.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400');
    expect(Number(head.headers.get('Content-Length'))).toBeGreaterThan(0);
    expect((await requestApp(app, 'GET', original)).bytes).toEqual(await fs.readFile(path.join(tempRoot, 'gallery/folder-a/image-a.jpg')));
    expect((await requestApp(app, 'GET', '/api/share/images/1/original')).status).toBe(401);
    const tampered = preview.replace('/media/', '/media/x');
    expect((await requestApp(app, 'GET', tampered)).status).toBe(404);
    const image = galleryService.getShareDerivativeImage(1)!;
    const changed = vi.spyOn(galleryService, 'getShareDerivativeImage').mockReturnValue({ ...image, mtime_ms: image.mtime_ms + 1 });
    try { expect((await requestApp(app, 'GET', preview)).status).toBe(404); }
    finally { changed.mockRestore(); }
    folderShareService.revokeLink('folder-a', link.link.id);
    const revoked = await requestApp(app, 'GET', preview);
    expect(revoked.status).toBe(404);
    expect(revoked.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('uses the same cache policy for regular albums, original downloads and shared media', async () => {
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(mockRes as any, { secure: false, get: () => undefined } as any, 'viewer');
    const headers = { Cookie: `foldergram_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    expect((await requestApp(app, 'GET', '/api/images/1')).status).toBe(401);
    const detail = await requestApp(app, 'GET', '/api/images/1', headers);
    expect(detail.status).toBe(200);
    expect(detail.headers.get('Cache-Control')).toContain('no-store');
    expect(detail.body.thumbnailUrl).toMatch(/^\/api\/share\/media\//);
    expect(detail.body.previewUrl).toMatch(/\/preview\.webp$/);
    expect(detail.body.originalUrl).toMatch(/\/source\.jpg$/);
    const expected = await fs.readFile(path.join(tempRoot, 'gallery', 'folder-a', 'image-a.jpg'));
    const source = await requestApp(app, 'GET', detail.body.originalUrl);
    expect(source.bytes).toEqual(expected);
    expect(source.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=86400');
    expect(source.headers.get('Content-Disposition')).toBeNull();
    const range = await requestApp(app, 'GET', detail.body.originalUrl, { Range: 'bytes=0-9' });
    expect(range.status).toBe(206);
    expect(range.bytes).toEqual(expected.subarray(0, 10));
    const redirect = await requestApp(app, 'GET', '/api/originals/1?download=1', headers);
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get('Cache-Control')).toContain('no-store');
    const download = await requestApp(app, 'GET', redirect.headers.get('Location')!);
    expect(download.bytes).toEqual(expected);
    expect(download.headers.get('Content-Disposition')).toContain('image-a.jpg');
    expect(download.headers.get('Cache-Control')).toBe(source.headers.get('Cache-Control'));
    expect((await requestApp(app, 'GET', '/api/originals/1?download=1')).status).toBe(401);
  });

  it('applies configured TTLs and restores protected URLs when caching is disabled', async () => {
    const { appConfig } = await import('../src/config/env.js');
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(mockRes as any, { secure: false, get: () => undefined } as any, 'admin');
    const headers = { Cookie: `foldergram_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    const originalTtl = appConfig.mediaCacheTtlSeconds;
    try {
      appConfig.mediaCacheTtlSeconds = 3600;
      const detail = await requestApp(app, 'GET', '/api/images/1', headers);
      const cached = await requestApp(app, 'GET', detail.body.thumbnailUrl);
      expect(cached.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=3600');
      appConfig.mediaCacheEnabled = false;
      expect((await requestApp(app, 'GET', '/api/images/1', headers)).body.thumbnailUrl).toMatch(/^\/thumbnails\//);
      expect((await requestApp(app, 'GET', '/api/share/images/1', headers)).body.previewUrl).toMatch(/^\/api\/share\/images\/1\/preview/);
      expect((await requestApp(app, 'GET', detail.body.thumbnailUrl)).status).toBe(404);
      const original = await requestApp(app, 'GET', '/api/originals/1', headers);
      expect(original.status).toBe(200);
      expect(original.headers.get('Cache-Control')).toContain('no-store');
    } finally {
      appConfig.mediaCacheTtlSeconds = originalTtl;
      appConfig.mediaCacheEnabled = true;
    }
  });

  it('serves cached animated previews and video originals with scanner-style dotted extensions', async () => {
    const { postRepository } = await import('../src/db/repositories.js');
    const post = postRepository.findBySourcePath('folder-a/carousels/trip')!;
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(mockRes as any, { secure: false, get: () => undefined } as any, 'viewer');
    const headers = { Cookie: `foldergram_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` };
    await fs.mkdir(path.join(tempRoot, 'previews/folder-a/carousels/trip'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'previews/folder-a/carousels/trip/02-animated.gif'), 'animated-preview');
    await fs.mkdir(path.join(tempRoot, 'gallery/folder-a/carousels/trip'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'gallery/folder-a/carousels/trip/03-video.mp4'), 'video-original');
    for (const route of [`/api/posts/${post.id}`, `/api/share/posts/${post.id}`]) {
      const detail = await requestApp(app, 'GET', route, headers);
      const animated = detail.body.mediaItems.find((item: any) => item.mediaType === 'image' && item.isAnimated);
      expect(animated.previewUrl).toMatch(/\/preview\.gif$/);
      const preview = await requestApp(app, 'GET', animated.previewUrl);
      expect(preview.status).toBe(200);
      expect(preview.body).toBe('animated-preview');
      const video = detail.body.mediaItems.find((item: any) => item.mediaType === 'video');
      const url = video.originalUrl ?? video.previewUrl.replace(/\/preview\.mp4$/, '/original.mp4');
      expect(url).toMatch(/\/(source|original)\.mp4$/);
      const original = await requestApp(app, 'GET', url);
      expect(original.status).toBe(200);
      expect(original.body).toBe('video-original');
    }
  });

  it('reuses image, folder, scan and signing context across media variants in one response', async () => {
    const { imageRepository, folderRepository, scanRunRepository } = await import('../src/db/repositories.js');
    const { cacheLibraryMediaUrls } = await import('../src/services/shared-media-cache.js');
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const template = imageRepository.getById(1)!;
    const images = Array.from({ length: 60 }, (_, index) => ({ ...template, id: index + 100,
      thumbnail_path: `performance/${index}.webp`, preview_path: `performance/${index}.webp` }));
    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(mockRes as any, { secure: false, get: () => undefined } as any, 'viewer');
    const request = { get: (name: string) => name.toLowerCase() === 'cookie' ? `foldergram_session=${mockRes.cookie.mock.calls.at(-1)?.[1]}` : undefined } as any;
    const spies = [vi.spyOn(imageRepository, 'getById'), vi.spyOn(imageRepository, 'getByThumbnailPath').mockImplementation(path => images.find(image => image.thumbnail_path === path)),
      vi.spyOn(imageRepository, 'getByPreviewPath'), vi.spyOn(folderRepository, 'getById'), vi.spyOn(scanRunRepository, 'latestCompleted'),
      vi.spyOn(folderShareService, 'createMediaTokenFactory')];
    try {
      const result = cacheLibraryMediaUrls(request, images.map(image => ({
        thumbnailUrl: `/thumbnails/${image.thumbnail_path}`, previewUrl: `/previews/${image.preview_path}`, originalUrl: `/api/originals/${image.id}`
      })));
      expect(result[0].originalUrl).toMatch(/\/source\.jpg$/);
      expect(result.every(image => image.previewUrl.includes('/api/share/media/'))).toBe(true);
      expect(spies.map(spy => spy.mock.calls.length)).toEqual([0, 60, 0, 1, 1, 1]);
    } finally { spies.forEach(spy => spy.mockRestore()); }
  });

  it.each(['/f/folder-a?view=scroll&photo=1', '/folders/folder-a', '/post/109?media=109', '/image/109?media=109'])('boots direct Cinema HTML with UnReeled branding and preserves Classic: %s', async (url) => {
    const { appSettingsRepository } = await import('../src/db/repositories.js');
    const { FOLDER_DISPLAY_THEME_SETTING_KEY } = await import('../src/constants/app-setting-keys.js');
    appSettingsRepository.set(FOLDER_DISPLAY_THEME_SETTING_KEY, 'cinema');
    const cinema = await requestApp(app, 'GET', url);
    expect(cinema.status).toBe(200);
    expect(cinema.body).toContain('<html class="shared-album-entry"');
    expect(cinema.body).toContain('<title>UnReeled Photos</title>');
    expect(cinema.body).toContain('data-cinema-entry="true"');
    expect(cinema.headers.get('Cache-Control')).toBe('no-store');
    appSettingsRepository.set(FOLDER_DISPLAY_THEME_SETTING_KEY, 'classic');
    const classic = await requestApp(app, 'GET', url);
    expect(classic.body).toContain('<html lang="en">');
    expect(classic.body).toContain('<title>Foldergram</title>');
    expect(classic.body).not.toContain('data-cinema-entry');
  });

  it('immediately revokes active share sessions when link is revoked', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    // Session works initially
    const initialRes = await requestApp(app, 'GET', '/api/share/folders/folder-a', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(initialRes.status).toBe(200);

    // Revoke link
    folderShareService.revokeLink('folder-a', link.link.id);

    // Session is immediately rejected
    const revokedRes = await requestApp(app, 'GET', '/api/share/folders/folder-a', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(revokedRes.status).toBe(401);
  });

  it('redacts sensitive metadata from shared JSON endpoints', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { postRepository, appSettingsRepository } = await import('../src/db/repositories.js');
    appSettingsRepository.set('folder.display_theme', 'cinema');
    const carousel = postRepository.findBySourcePath('folder-a/carousels/trip')!;
    const expectRecursivelyRedacted = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(expectRecursivelyRedacted);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      for (const key of ['absolutePath', 'exifJson', 'originalUrl', 'relativePath', 'sourcePath', 'latitude', 'longitude', 'altitudeMeters']) {
        expect(record).not.toHaveProperty(key);
      }
      if (record.exif) {
        for (const key of Object.keys(record.exif as object)) {
          expect(['cameraMake', 'cameraModel', 'lensModel', 'fNumber', 'exposureTimeSeconds', 'iso', 'focalLengthMm', 'focalLength35mmMm']).toContain(key);
        }
      }
      Object.values(record).forEach(expectRecursivelyRedacted);
    };
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    // Folder detail
    const folderRes = await requestApp(app, 'GET', '/api/share/folders/folder-a', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(folderRes.status).toBe(200);
    expect(folderRes.body.displayTheme).toBe('cinema');
    expect(folderRes.body).not.toHaveProperty('folderPath');
    expect(folderRes.body).not.toHaveProperty('absolutePath');

    // Folder images
    const imagesRes = await requestApp(app, 'GET', '/api/share/folders/folder-a/images', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(imagesRes.status).toBe(200);
    expect(imagesRes.body.folder.displayTheme).toBe('cinema');
    expect(imagesRes.body.items[0]).not.toHaveProperty('folderPath');
    expect(imagesRes.body.items[0]).not.toHaveProperty('relativePath');
    expect(imagesRes.body.items[0]).not.toHaveProperty('exif');
    expectRecursivelyRedacted(imagesRes.body);

    // Shared image detail
    const imageDetailRes = await requestApp(app, 'GET', '/api/share/images/1', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(imageDetailRes.status).toBe(200);
    expect(imageDetailRes.body).not.toHaveProperty('folderPath');
    expect(imageDetailRes.body).not.toHaveProperty('relativePath');
    expect(imageDetailRes.body).not.toHaveProperty('absolutePath');
    expect(imageDetailRes.body.exif).toEqual({ cameraMake: 'Canon' });
    expect(imageDetailRes.body.displayTheme).toBe('cinema');
    expectRecursivelyRedacted(imageDetailRes.body);

    const carouselDetailRes = await requestApp(app, 'GET', `/api/share/posts/${carousel.id}`, {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(carouselDetailRes.status).toBe(200);
    expect(carouselDetailRes.body.mediaItems).toHaveLength(3);
    expect(carouselDetailRes.body.mediaItems[0].exif).toEqual({ cameraModel: 'Private Camera' });
    expect(carouselDetailRes.body.mediaItems[2].playbackStrategy).toBe('preview');
    expectRecursivelyRedacted(carouselDetailRes.body);

    folderShareService.setPassword('folder-a', 'carousel-password');
    const passwordGrant = folderShareService.verifyPassword('folder-a', 'carousel-password')!;
    const passwordResponse = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(
      passwordResponse as any,
      { secure: false, get: () => undefined } as any,
      passwordGrant
    );
    const passwordCookie = passwordResponse.cookie.mock.calls.at(-1)?.[1];
    const passwordDetailRes = await requestApp(app, 'GET', `/api/share/posts/${carousel.id}`, {
      Cookie: `foldergram_share_session=${passwordCookie}`
    });
    expect(passwordDetailRes.status).toBe(200);
    expectRecursivelyRedacted(passwordDetailRes.body);
  });

  it('retains public camera metadata while redacting paths and coordinates recursively', async () => {
    const { postRepository, appSettingsRepository } = await import('../src/db/repositories.js');
    appSettingsRepository.set('folder.display_theme', 'cinema');
    const carousel = postRepository.findBySourcePath('folder-a/carousels/trip')!;
    authService.setViewerAccess('public');

    const assertNoSensitiveKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(assertNoSensitiveKeys);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      for (const key of ['absolutePath', 'exifJson', 'relativePath', 'sourcePath', 'latitude', 'longitude', 'altitudeMeters']) {
        expect(record).not.toHaveProperty(key);
      }
      if (record.exif) {
        for (const key of Object.keys(record.exif as object)) {
          expect(['cameraMake', 'cameraModel', 'lensModel', 'fNumber', 'exposureTimeSeconds', 'iso', 'focalLengthMm', 'focalLength35mmMm']).toContain(key);
        }
      }
      Object.values(record).forEach(assertNoSensitiveKeys);
    };

    const feedRes = await requestApp(app, 'GET', '/api/feed?mode=recent');
    expect(feedRes.status).toBe(200);
    const publicCarousel = feedRes.body.items.find((item: { id: number }) => item.id === carousel.id);
    expect(publicCarousel?.mediaItems).toHaveLength(3);
    expect(publicCarousel).toMatchObject({
      folderPath: 'folder-a',
      carouselTitle: 'trip'
    });
    expect(publicCarousel).not.toHaveProperty('sourcePath');
    assertNoSensitiveKeys(feedRes.body);

    const detailRes = await requestApp(app, 'GET', `/api/posts/${carousel.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.mediaItems).toHaveLength(3);
    expect(detailRes.body).toMatchObject({
      folderPath: 'folder-a',
      carouselTitle: 'trip'
    });
    assertNoSensitiveKeys(detailRes.body);
    expect(detailRes.body.mediaItems[0].exif).toEqual({ cameraModel: 'Private Camera' });

    const adminResponse = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(
      adminResponse as any,
      { secure: false, get: () => undefined } as any,
      'admin'
    );
    const adminCookie = adminResponse.cookie.mock.calls.at(-1)?.[1];
    const adminDetailRes = await requestApp(app, 'GET', `/api/posts/${carousel.id}`, {
      Cookie: `foldergram_session=${adminCookie}`
    });
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body).toMatchObject({
      folderPath: 'folder-a',
      sourcePath: 'folder-a/carousels/trip',
      carouselTitle: 'trip'
    });
    expect(adminDetailRes.body.mediaItems[0]).toHaveProperty('relativePath');
    expect(adminDetailRes.body.mediaItems[0]).toHaveProperty('exif');
  });

  it('serves shared derivatives (pre-existing and lazy-generated) with Cache-Control: private, no-store and Vary: Cookie', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    // Case 1: Pre-existing derivative file
    const resPreExisting = await requestApp(app, 'GET', '/api/share/images/1/thumbnail', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(resPreExisting.status).toBe(200);
    expect(resPreExisting.headers.get('cache-control')).toBe('private, no-store');
    expect(resPreExisting.headers.get('vary')).toContain('Cookie');

    // Case 2: Lazy generation (file does not exist on disk, must be generated on-demand)
    await fs.rm(path.join(tempRoot, 'thumbnails', 'folder-a', 'image-a.webp'), { force: true });
    await fs.rm(path.join(tempRoot, 'previews', 'folder-a', 'image-a.webp'), { force: true });

    const resLazyThumb = await requestApp(app, 'GET', '/api/share/images/1/thumbnail', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(resLazyThumb.status).toBe(200);
    expect(resLazyThumb.headers.get('cache-control')).toBe('private, no-store');
    expect(resLazyThumb.headers.get('vary')).toContain('Cookie');

    const resLazyPreview = await requestApp(app, 'GET', '/api/share/images/1/preview', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(resLazyPreview.status).toBe(200);
    expect(resLazyPreview.headers.get('cache-control')).toBe('private, no-store');
    expect(resLazyPreview.headers.get('vary')).toContain('Cookie');
  });

  it('rejects unlocking expired share links via API endpoint', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', {
      expiresAt: new Date(Date.now() - 3_600_000)
    })!;

    const unlockRes = await requestApp(
      app,
      'POST',
      '/api/share/folders/folder-a/unlock-link',
      { 'x-foldergram-intent': '1' },
      { token: link.rawToken }
    );
    expect(unlockRes.status).toBe(403);
    expect(unlockRes.body).toEqual({ message: 'This folder share is expired, revoked, or locked.' });
  });

  it('never stores raw reusable passwords in SQLite or returns them in API responses', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const { folderSharePasswordRepository, folderRepository } = await import('../src/db/repositories.js');

    folderShareService.setPassword('folder-a', 'super-secret-password-99');

    const folderA = folderRepository.getNormalBySlug('folder-a')!;
    const dbRecord = folderSharePasswordRepository.get(folderA.id)!;

    expect(dbRecord.password_hash).not.toBe('super-secret-password-99');
    expect(dbRecord.password_hash).not.toContain('super-secret-password-99');
    expect(Object.keys(dbRecord)).not.toContain('password');

    // Admin share links list endpoint
    const adminResMock = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(adminResMock as any, { secure: false, get: () => undefined } as any, 'admin');
    const adminCookie = adminResMock.cookie.mock.calls.at(-1)?.[1];

    const linksRes = await requestApp(app, 'GET', '/api/admin/folders/folder-a/share-links', {
      Cookie: `foldergram_session=${adminCookie}`
    });
    expect(linksRes.status).toBe(200);

    expect(JSON.stringify(linksRes.body)).not.toContain('super-secret-password-99');
  });

  it('rejects cross-folder preview access with 401', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    const allowedRes = await requestApp(app, 'GET', '/api/share/images/1/preview', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(allowedRes.status).toBe(200);

    const rejectedRes = await requestApp(app, 'GET', '/api/share/images/2/preview', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(rejectedRes.status).toBe(401);
  });

  it('revokes share links through API endpoint with required intent header', async () => {
    const { folderShareService } = await import('../src/services/folder-share-service.js');
    const link = folderShareService.createLink('folder-a', { expiresAt: null })!;
    const grant = folderShareService.verifyLinkToken('folder-a', link.rawToken)!;

    const mockRes = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    folderShareService.setShareSession(mockRes as any, { secure: false, get: () => undefined } as any, grant);
    const shareCookie = mockRes.cookie.mock.calls.at(-1)?.[1];

    // Session works initially
    const initialRes = await requestApp(app, 'GET', '/api/share/images/1/thumbnail', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(initialRes.status).toBe(200);

    // Get admin cookie
    const adminResMock = { cookie: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    authService.setAuthenticatedSession(adminResMock as any, { secure: false, get: () => undefined } as any, 'admin');
    const adminCookie = adminResMock.cookie.mock.calls.at(-1)?.[1];

    // Delete link via API
    const deleteRes = await requestApp(
      app,
      'DELETE',
      `/api/admin/folders/folder-a/share-links/${link.link.id}`,
      {
        Cookie: `foldergram_session=${adminCookie}`,
        'x-foldergram-intent': '1'
      }
    );
    expect(deleteRes.status).toBe(200);

    // Share session should now be rejected
    const rejectedRes = await requestApp(app, 'GET', '/api/share/images/1/thumbnail', {
      Cookie: `foldergram_share_session=${shareCookie}`
    });
    expect(rejectedRes.status).toBe(401);
  });
});

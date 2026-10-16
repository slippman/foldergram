import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthServiceModule = typeof import('../src/services/auth-service.js');
type FolderShareServiceModule = typeof import('../src/services/folder-share-service.js');
type RepositoriesModule = typeof import('../src/db/repositories.js');
type DatabaseModule = typeof import('../src/db/database.js');

interface MockResponse {
  cookie: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
}

function createRequest(headers: Record<string, string | undefined> = {}): express.Request {
  const normalizedHeaders = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

  return {
    secure: false,
    get(name: string) {
      return normalizedHeaders.get(name.toLowerCase());
    }
  } as unknown as express.Request;
}

function createResponse(): MockResponse {
  return {
    cookie: vi.fn().mockReturnThis(),
    setHeader: vi.fn()
  };
}

function extractCookieHeader(response: MockResponse): string {
  const [name, value] = response.cookie.mock.calls.at(-1) ?? [];
  if (typeof name !== 'string' || typeof value !== 'string') {
    throw new Error('Expected a share session cookie to be set');
  }

  return `${name}=${value}`;
}

describe.sequential('folder share service', () => {
  let tempRoot = '';
  let authService: AuthServiceModule['authService'];
  let folderShareService: FolderShareServiceModule['folderShareService'];
  let folderRepository: RepositoriesModule['folderRepository'];
  let folderShareLinkRepository: RepositoriesModule['folderShareLinkRepository'];
  let maintenanceRepository: RepositoriesModule['maintenanceRepository'];

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foldergram-folder-share-'));

    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATA_ROOT', path.join(tempRoot, 'data'));
    vi.stubEnv('GALLERY_ROOT', path.join(tempRoot, 'gallery'));
    vi.stubEnv('DB_DIR', path.join(tempRoot, 'db'));
    vi.stubEnv('THUMBNAILS_DIR', path.join(tempRoot, 'thumbnails'));
    vi.stubEnv('PREVIEWS_DIR', path.join(tempRoot, 'previews'));
  });

  beforeEach(async () => {
    try {
      const dbModule: DatabaseModule = await import('../src/db/database.js');
      dbModule.databaseManager.close();
    } catch {
      // Ignore if not loaded
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
    await Promise.all([
      fs.mkdir(path.join(tempRoot, 'db'), { recursive: true }),
      fs.mkdir(path.join(tempRoot, 'gallery'), { recursive: true }),
      fs.mkdir(path.join(tempRoot, 'thumbnails'), { recursive: true }),
      fs.mkdir(path.join(tempRoot, 'previews'), { recursive: true })
    ]);

    vi.resetModules();
    ({ authService } = await import('../src/services/auth-service.js'));
    ({ folderShareService } = await import('../src/services/folder-share-service.js'));
    ({ folderRepository, folderShareLinkRepository, maintenanceRepository } = await import('../src/db/repositories.js'));
    maintenanceRepository.resetLibraryIndex();
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

  it('stores a token hash and can recover the same active link without rotating it', async () => {
    folderRepository.upsert({ slug: 'family', name: 'Family', folderPath: 'family' });

    const created = folderShareService.createLink('family', {
      expiresAt: new Date(Date.now() + 60_000)
    });

    expect(created).not.toBeNull();
    expect(created!.rawToken).toHaveLength(43);
    expect(created!.link.tokenPrefix).toBe(created!.rawToken.slice(0, 8));
    expect(Object.keys(created!.link)).not.toContain('token_hash');

    const stored = folderShareLinkRepository.listByFolder(created!.folder.id);
    expect(stored).toHaveLength(1);
    expect(stored[0].token_hash).not.toBe(created!.rawToken);
    expect(stored[0].token_hash).not.toContain(created!.rawToken);
    expect(created!.link.canCopy).toBe(true);
    const firstCopy = folderShareService.copyLink('family', created!.link.id);
    expect(firstCopy).toMatch(/^\/s\/[0-9a-z]+-[A-Za-z0-9_-]{16}$/);
    const code = firstCopy!.slice(3);
    expect(folderShareService.resolveShortLink(code)).toContain(`#token=${created!.rawToken}`);
    expect(folderShareService.resolveShortLink(code + 'x')).toBeNull();
    expect(folderShareService.resolveShortLink(code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(folderShareService.copyLink('family', created!.link.id)).toBe(firstCopy);
    expect(folderShareService.copyLink('other', created!.link.id)).toBeNull();
    const keyPath = path.join(tempRoot, 'data/secrets/share-link-recovery.key');
    expect((await fs.stat(keyPath)).mode & 0o777).toBe(0o600);
    const key = await fs.readFile(keyPath);
    expect(key).toHaveLength(32);
    await fs.writeFile(keyPath, Buffer.alloc(32));
    expect(folderShareService.copyLink('family', created!.link.id)).toBeNull();
    expect(folderShareService.resolveShortLink(code)).toBeNull();
    expect(folderShareService.verifyLinkToken('family', created!.rawToken)).not.toBeNull();
    await fs.writeFile(keyPath, key);
    expect(folderShareService.copyLink('family', created!.link.id)).toBe(firstCopy);
    expect(folderShareService.resolveShortLink(code)).toContain(`#token=${created!.rawToken}`);
    folderShareService.revokeLink('family', created!.link.id);
    expect(folderShareService.copyLink('family', created!.link.id)).toBeNull();
    expect(folderShareService.resolveShortLink(code)).toBeNull();
  });

  it('does not reserve links when the recovery key is invalid', async () => {
    const folder = folderRepository.upsert({ slug: 'family', name: 'Family', folderPath: 'family' });
    await fs.mkdir(path.join(tempRoot, 'data/secrets'), { recursive: true });
    await fs.writeFile(path.join(tempRoot, 'data/secrets/share-link-recovery.key'), 'invalid');
    expect(() => folderShareService.createLink('family', { expiresAt: null })).toThrow('Invalid share link recovery key');
    expect(folderShareLinkRepository.listByFolder(folder.id)).toHaveLength(0);
  });

  it('keeps listing and revocation available when the recovery key is invalid', async () => {
    folderRepository.upsert({ slug: 'family', name: 'Family', folderPath: 'family' });
    const created = folderShareService.createLink('family', { expiresAt: null })!;
    await fs.writeFile(path.join(tempRoot, 'data/secrets/share-link-recovery.key'), 'invalid');
    expect(folderShareService.listLinks('family')!.links[0].canCopy).toBe(false);
    expect(folderShareService.verifyLinkToken('family', created.rawToken)).not.toBeNull();
    expect(folderShareService.revokeLink('family', created.link.id)!.status).toBe('revoked');
  });

  it('rolls back reservations when storing the final token fails', () => {
    const folder = folderRepository.upsert({ slug: 'family', name: 'Family', folderPath: 'family' });
    const update = vi.spyOn(folderShareLinkRepository, 'updateToken').mockImplementationOnce(() => {
      throw new Error('Token update failed');
    });
    try {
      expect(() => folderShareService.createLink('family', { expiresAt: null })).toThrow('Token update failed');
      expect(folderShareLinkRepository.listByFolder(folder.id)).toHaveLength(0);
    } finally {
      update.mockRestore();
    }
    expect(folderShareService.createLink('family', { expiresAt: null })!.link.canCopy).toBe(true);
  });

  it('creates a folder-scoped share session from a valid token', () => {
    authService.setAdminPassword('admin-pass-123');
    const folder = folderRepository.upsert({ slug: 'album', name: 'Album', folderPath: 'album' });
    const otherFolder = folderRepository.upsert({ slug: 'other', name: 'Other', folderPath: 'other' });
    const created = folderShareService.createLink('album', {
      expiresAt: new Date(Date.now() + 60_000)
    })!;
    const grant = folderShareService.verifyLinkToken('album', created.rawToken);
    const response = createResponse();

    expect(grant).toMatchObject({
      folderId: folder.id,
      kind: 'link'
    });

    folderShareService.setShareSession(response as unknown as express.Response, createRequest(), grant!);
    const request = createRequest({
      cookie: extractCookieHeader(response)
    });

    expect(folderShareService.getFolderGrant(request, folder.id)).toMatchObject({
      folderId: folder.id,
      kind: 'link'
    });
    expect(folderShareService.getFolderGrant(request, otherFolder.id)).toBeNull();
  });

  it('rejects expired and revoked link tokens', () => {
    folderRepository.upsert({ slug: 'album', name: 'Album', folderPath: 'album' });
    const expired = folderShareService.createLink('album', {
      expiresAt: new Date(Date.now() - 60_000)
    })!;
    const active = folderShareService.createLink('album', {
      expiresAt: null
    })!;

    expect(folderShareService.verifyLinkToken('album', expired.rawToken)).toBeNull();
    expect(folderShareService.verifyLinkToken('album', active.rawToken)).toMatchObject({
      kind: 'link'
    });

    folderShareService.revokeLink('album', active.link.id);
    expect(folderShareService.verifyLinkToken('album', active.rawToken)).toBeNull();
  });

  it('bounds media capabilities by asset, album, expiration and password version', () => {
    authService.setAdminPassword('admin-pass-123');
    const folder = folderRepository.upsert({ slug: 'album', name: 'Album', folderPath: 'album' });
    folderShareService.setPassword('album', 'share-pass-123');
    const grant = folderShareService.verifyPassword('album', 'share-pass-123')!;
    const response = createResponse();
    folderShareService.setShareSession(response as unknown as express.Response, createRequest(), grant);
    const request = createRequest({ cookie: extractCookieHeader(response) });
    const token = folderShareService.createMediaToken(request, folder.id, 'asset-version', 10)!;
    expect(folderShareService.verifyMediaToken(token, folder.id, 'asset-version')).toBe(true);
    expect(folderShareService.verifyMediaToken(token, folder.id + 1, 'asset-version')).toBe(false);
    expect(folderShareService.verifyMediaToken(token, folder.id, 'changed-asset')).toBe(false);
    const [encoded, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    const tampered = Buffer.from(JSON.stringify({ ...payload, scopeImageId: 11 })).toString('base64url');
    expect(folderShareService.verifyMediaToken(`${tampered}.${signature}`, folder.id, 'asset-version')).toBe(false);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(payload.exp + 1);
    try { expect(folderShareService.verifyMediaToken(token, folder.id, 'asset-version')).toBe(false); }
    finally { clock.mockRestore(); }
    folderShareService.setPassword('album', 'changed-pass-123');
    expect(folderShareService.verifyMediaToken(token, folder.id, 'asset-version')).toBe(false);
    expect(folderShareService.createMediaToken(request, folder.id, 'asset-version', 10)).toBeNull();
  });

  it('invalidates password sessions when the folder password changes or is removed', () => {
    authService.setAdminPassword('admin-pass-123');
    const folder = folderRepository.upsert({ slug: 'album', name: 'Album', folderPath: 'album' });

    folderShareService.setPassword('album', 'share-pass-123');
    const grant = folderShareService.verifyPassword('album', 'share-pass-123');
    const response = createResponse();

    expect(grant).toMatchObject({
      folderId: folder.id,
      kind: 'password'
    });

    folderShareService.setShareSession(response as unknown as express.Response, createRequest(), grant!);
    const request = createRequest({
      cookie: extractCookieHeader(response)
    });

    expect(folderShareService.getFolderGrant(request, folder.id)).toMatchObject({
      folderId: folder.id,
      kind: 'password'
    });

    folderShareService.setPassword('album', 'changed-pass-123');
    expect(folderShareService.getFolderGrant(request, folder.id)).toBeNull();
    expect(folderShareService.verifyPassword('album', 'share-pass-123')).toBeNull();
    expect(folderShareService.verifyPassword('album', 'changed-pass-123')).toMatchObject({
      kind: 'password'
    });

    const changedGrant = folderShareService.verifyPassword('album', 'changed-pass-123')!;
    const changedResponse = createResponse();
    folderShareService.setShareSession(changedResponse as unknown as express.Response, createRequest(), changedGrant);
    const changedRequest = createRequest({
      cookie: extractCookieHeader(changedResponse)
    });

    expect(folderShareService.getFolderGrant(changedRequest, folder.id)).toMatchObject({
      kind: 'password'
    });

    folderShareService.removePassword('album');
    expect(folderShareService.getFolderGrant(changedRequest, folder.id)).toBeNull();

    // Recreate password and verify original version-1 session cookie remains rejected
    folderShareService.setPassword('album', 'new-pass-456');
    expect(folderShareService.getFolderGrant(request, folder.id)).toBeNull();
    expect(folderShareService.getFolderGrant(changedRequest, folder.id)).toBeNull();
  });

  it('invalidates active share sessions when a full library reset occurs', () => {
    authService.setAdminPassword('admin-pass-123');
    const folder = folderRepository.upsert({ slug: 'album', name: 'Album', folderPath: 'album' });
    const created = folderShareService.createLink('album', { expiresAt: new Date(Date.now() + 60_000) })!;
    const grant = folderShareService.verifyLinkToken('album', created.rawToken)!;
    const response = createResponse();

    folderShareService.setShareSession(response as unknown as express.Response, createRequest(), grant);
    const request = createRequest({ cookie: extractCookieHeader(response) });

    expect(folderShareService.getFolderGrant(request, folder.id)).toMatchObject({
      folderId: folder.id,
      kind: 'link'
    });

    maintenanceRepository.resetLibraryIndex();

    expect(folderShareService.getFolderGrant(request, folder.id)).toBeNull();
  });
});

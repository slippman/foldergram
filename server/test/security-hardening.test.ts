import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestTestApp as request } from './http-test-utils.js';

describe.sequential('public hosting security', () => {
  let root = '';
  let app: express.Application;
  let auth: typeof import('../src/services/auth-service.js')['authService'];
  let config: typeof import('../src/config/env.js')['appConfig'];

  beforeAll(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'foldergram-security-')); });
  beforeEach(async () => {
    try { (await import('../src/db/database.js')).databaseManager.close(); } catch { /* First import. */ }
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_REQUIRED', 'true');
    vi.stubEnv('CSRF_TRUSTED_ORIGINS', '');
    vi.stubEnv('DATA_ROOT', root);
    vi.stubEnv('GALLERY_ROOT', path.join(root, 'gallery'));
    vi.stubEnv('DB_DIR', path.join(root, 'db'));
    vi.stubEnv('THUMBNAILS_DIR', path.join(root, 'thumbnails'));
    vi.stubEnv('PREVIEWS_DIR', path.join(root, 'previews'));
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(path.join(root, 'thumbnails'), { recursive: true });
    await fs.writeFile(path.join(root, 'thumbnails', 'canary.webp'), 'synthetic-private-media');
  });
  afterAll(async () => {
    (await import('../src/db/database.js')).databaseManager.close();
    vi.unstubAllEnvs();
    vi.resetModules();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function start(password = true) {
    ({ appConfig: config } = await import('../src/config/env.js'));
    ({ authService: auth } = await import('../src/services/auth-service.js'));
    if (password) auth.setAdminPassword('synthetic-admin-password');
    app = (await import('../src/app.js')).createApp();
  }

  async function assertClosed() {
    for (const url of ['/', '/api/health', '/api/auth/status', '/api/admin/stats',
      '/thumbnails/canary.webp', '/previews/canary.mp4', '/api/originals/1',
      '/api/share/images/1/original', '/share/family', '/share-preview/family/cover', '/s/invalid']) {
      const response = await request(app, 'GET', url);
      expect(response.status, url).toBe(503);
      expect(response.headers.get('cache-control'), url).toBe('no-store');
      expect(JSON.stringify(response.body), url).not.toContain(root);
    }
    const takeover = await request(app, 'PUT', '/api/auth/password',
      { 'x-foldergram-intent': '1' }, { password: 'attacker-chosen-password' });
    expect(takeover.status).toBe(503);
    const context = auth.getRequestAuthContext({ get: () => undefined } as unknown as express.Request);
    expect(context.authenticated).toBe(false);
    expect(context.capabilities.canManageLibrary).toBe(false);
  }

  it('blocks every access path and remote password setup for an empty production database', async () => {
    await start(false);
    await assertClosed();
  });

  it('blocks transient storage even if optional passwordless access was selected', async () => {
    vi.stubEnv('AUTH_REQUIRED', 'false');
    await fs.writeFile(path.join(root, 'db'), 'unavailable mount');
    await start(false);
    await assertClosed();
  });

  it('rejects partial or damaged authentication settings even in optional mode', async () => {
    vi.stubEnv('AUTH_REQUIRED', 'false');
    await start();
    const { appSettingsRepository } = await import('../src/db/repositories.js');
    const { AUTH_SESSION_SECRET_SETTING_KEY } = await import('../src/constants/app-setting-keys.js');
    appSettingsRepository.set(AUTH_SESSION_SECRET_SETTING_KEY, 'broken');
    auth.refresh();
    await assertClosed();
  });

  it('recovers only after authentication data is restored and cannot disable required protection', async () => {
    await start(false);
    expect((await request(app, 'GET', '/api/auth/status')).status).toBe(503);
    auth.setAdminPassword('restored-admin-password');
    const login = await request(app, 'POST', '/api/auth/login', { 'x-foldergram-intent': '1' }, { password: 'restored-admin-password' });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const disable = await request(app, 'DELETE', '/api/auth/password',
      { 'x-foldergram-intent': '1', Cookie: cookie }, { currentPassword: 'restored-admin-password' });
    expect(disable.status).toBe(409);
    expect(auth.verifyAdminPassword('restored-admin-password')).toBe(true);
    expect((await request(app, 'GET', '/thumbnails/canary.webp')).status).toBe(401);
    expect((await request(app, 'GET', '/thumbnails/canary.webp', { Cookie: cookie })).status).toBe(200);
  });

  it('preserves explicitly selected passwordless operation with a healthy database', async () => {
    vi.stubEnv('AUTH_REQUIRED', 'false');
    await start(false);
    expect((await request(app, 'GET', '/thumbnails/canary.webp')).status).toBe(200);
  });

  it('sets browser protections on HTML, media, API, errors, and unavailable responses', async () => {
    await start();
    for (const url of ['/', '/share/family', '/api/health', '/thumbnails/canary.webp', '/branding/missing']) {
      const response = await request(app, 'GET', url);
      expect(response.headers.get('content-security-policy'), url).toContain("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options'), url).toBe('DENY');
      expect(response.headers.get('x-content-type-options'), url).toBe('nosniff');
      expect(response.headers.get('referrer-policy'), url).toBe('no-referrer');
      expect(response.headers.get('strict-transport-security'), url).toBe('max-age=31536000');
      expect(response.headers.get('x-powered-by'), url).toBeNull();
    }
  });
});

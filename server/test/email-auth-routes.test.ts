import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTestApp as request } from './http-test-utils.js';

describe.sequential('invite-only email sign-in', () => {
  let root: string;
  let app: express.Application;
  let auth: typeof import('../src/services/auth-service.js')['authService'];
  let accounts: typeof import('../src/db/email-account-repository.js')['emailAccountRepository'];
  let repo: typeof import('../src/db/repositories.js');
  let adminCookie: string;
  let postId: number;
  let send: ReturnType<typeof vi.fn>;
  const intent = { 'x-foldergram-intent': '1' };
  const cookieFrom = (headers: Headers, name: string) => [...(headers.get('set-cookie') ?? '').matchAll(new RegExp(`${name}=([^;,\\s]*)`, 'g'))].at(-1)?.[0] ?? '';

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'foldergram-email-routes-'));
    for (const [key, value] of Object.entries({ NODE_ENV: 'test', DATA_ROOT: path.join(root, 'data'),
      DB_DIR: path.join(root, 'db'), GALLERY_ROOT: path.join(root, 'gallery'), THUMBNAILS_DIR: path.join(root, 'thumbs'), PREVIEWS_DIR: path.join(root, 'previews'),
      EMAIL_SIGN_IN_ENABLED: 'true', EMAIL_SCREEN_NAMES_ENABLED: 'false', EMAIL_SIGN_IN_ORIGIN: 'https://photos.example.com', EMAIL_FROM: 'photos@example.com', RESEND_API_KEY: 'test-only-key' })) vi.stubEnv(key, value);
  });
  beforeEach(async () => {
    try { (await import('../src/db/database.js')).databaseManager.close(); } catch { /* not initialized */ }
    vi.resetModules();
    await fs.rm(root, { recursive: true, force: true });
    for (const dir of ['data', 'db', 'gallery', 'thumbs', 'previews']) await fs.mkdir(path.join(root, dir), { recursive: true });
    send = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', send);
    ({ authService: auth } = await import('../src/services/auth-service.js'));
    ({ emailAccountRepository: accounts } = await import('../src/db/email-account-repository.js'));
    repo = await import('../src/db/repositories.js');
    auth.setAdminPassword('admin-password-123');
    const folder = repo.folderRepository.upsert({ slug: 'album', name: 'Album', folderPath: 'album' });
    const image = repo.imageRepository.upsert({ folderId: folder.id, filename: 'photo.jpg', extension: '.jpg', relativePath: 'album/photo.jpg', absolutePath: path.join(root, 'gallery/album/photo.jpg'),
      fileSize: 100, width: 100, height: 100, mediaType: 'image', mimeType: 'image/jpeg', durationMs: null, fingerprint: 'test', mtimeMs: Date.now(),
      firstSeenAt: new Date().toISOString(), sortTimestamp: Date.now(), takenAt: Date.now(), takenAtSource: 'exif', exifJson: null,
      thumbnailPath: 'photo.webp', previewPath: 'photo.webp' });
    postId = repo.postRepository.findByImageId(image.id)!.id;
    app = (await import('../src/app.js')).createApp();
    const login = await request(app, 'POST', '/api/auth/login', intent, { password: 'admin-password-123' });
    expect(login.status).toBe(200);
    adminCookie = cookieFrom(login.headers, 'foldergram_session');
  });
  afterAll(async () => {
    (await import('../src/db/database.js')).databaseManager.close();
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function linkFor(email: string) {
    const count = send.mock.calls.length;
    const response = await request(app, 'POST', '/api/auth/email/request', intent, { email });
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(send.mock.calls.length).toBe(count + 1));
    const payload = JSON.parse(send.mock.calls.at(-1)![1].body);
    const link = new URL(payload.text.match(/https:[^\s]+/)[0]);
    expect(link.origin).toBe('https://photos.example.com');
    return new URLSearchParams(link.hash.slice(1)).get('token')!;
  }
  async function signIn(email: string) {
    const token = await linkFor(email);
    const response = await request(app, 'POST', '/api/auth/email/confirm', intent, { token });
    expect(response.status).toBe(200);
    return { cookie: cookieFrom(response.headers, 'foldergram_email_session'), token, response };
  }

  it('rejects password disabling explicitly in email mode even when AUTH_REQUIRED is false', async () => {
    const { appConfig } = await import('../src/config/env.js');
    const previous = appConfig.authRequired;
    appConfig.authRequired = false;
    try {
      const response = await request(app, 'DELETE', '/api/auth/password', { ...intent, cookie: adminCookie }, { currentPassword: 'admin-password-123' });
      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Password protection is required by server configuration.');
      expect(auth.isEnabled()).toBe(true);
      expect(auth.verifyAdminPassword('admin-password-123')).toBe(true);
    } finally { appConfig.authRequired = previous; }
  });

  it('sends a verification email directly from an admin invitation without an intermediate acceptance link', async () => {
    const endpoint = '/api/admin/users/invitations/send';
    expect((await request(app, 'POST', endpoint, intent, { email: 'direct@example.com' })).status).toBe(401);
    expect((await request(app, 'POST', endpoint, { cookie: adminCookie }, { email: 'direct@example.com' })).status).toBe(403);
    const result = await request(app, 'POST', endpoint, { ...intent, cookie: adminCookie }, { email: ' DIRECT@example.com ' });
    expect(result.status).toBe(200); expect(result.body.emailSent).toBe(true);
    expect(result.headers.get('set-cookie') ?? '').not.toContain('foldergram_email_session');
    expect(accounts.getByEmail('direct@example.com')?.access_status).toBe('approved');
    expect(send).toHaveBeenCalledTimes(1);
    const mail = JSON.parse(send.mock.calls[0][1].body);
    expect(mail.to).toEqual(['direct@example.com']);
    const link = new URL(mail.text.match(/https:[^\s]+/)[0]);
    expect(link.pathname).toBe('/signin'); expect(link.hash).toMatch(/^#token=/); expect(link.hash).not.toContain('invite=');
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    expect((await request(app, 'GET', '/api/feed')).status).toBe(401);
    const confirmed = await request(app, 'POST', '/api/auth/email/confirm', intent, { token });
    expect(confirmed.status).toBe(200);
    const cookie = cookieFrom(confirmed.headers, 'foldergram_email_session');
    expect((await request(app, 'GET', '/api/feed', { cookie })).status).toBe(200);
    expect((await request(app, 'POST', endpoint, { ...intent, cookie }, { email: 'other@example.com' })).status).toBe(403);
    const user = accounts.getByEmail('direct@example.com')!;
    expect((await request(app, 'POST', endpoint, { ...intent, cookie: adminCookie }, { email: user.email })).status).toBe(200);
    expect(accounts.getByEmail(user.email)).toMatchObject({ id: user.id, display_name: user.display_name, last_signed_in_at: user.last_signed_in_at });
  });

  it('reports failed invitation delivery accurately, invalidates previous invite credentials, and respects legacy blocks', async () => {
    const endpoint = '/api/admin/users/invitations/send';
    accounts.requestAccess('pending@example.com');
    const user = accounts.getByEmail('pending@example.com')!;
    accounts.createInvitation(user.email, 'old-invite', auth.getSessionVersion(), Date.now() + 60_000);
    accounts.claimAccessReview(user.id, 'old-review', auth.getSessionVersion(), 'owner-hash', Date.now() + 60_000);
    send.mockResolvedValueOnce(new Response('private-provider-details', { status: 503 }));
    const failed = await request(app, 'POST', endpoint, { ...intent, cookie: adminCookie }, { email: user.email });
    expect(failed.status).toBe(503); expect(JSON.stringify(failed.body)).not.toContain('private-provider-details');
    expect(accounts.getById(user.id)?.access_status).toBe('approved');
    const { databaseManager } = await import('../src/db/database.js');
    for (const table of ['email_sign_in_tokens', 'email_access_reviews', 'email_invitations']) {
      expect(databaseManager.connection.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`).get(user.id)!.count).toBe(0);
    }
    accounts.revoke(user.id);
    const blocked = await request(app, 'POST', endpoint, { ...intent, cookie: adminCookie }, { email: user.email });
    expect(blocked.status).toBe(409); expect(send).toHaveBeenCalledTimes(1);
    expect(accounts.getById(user.id)?.access_status).toBe('banned');
  });

  it('creates an email-bound invite only for admins, waits for explicit acceptance and mailbox verification', async () => {
    const { appConfig } = await import('../src/config/env.js');
    appConfig.emailScreenNamesEnabled = true;
    const path = '/api/admin/users/invitations';
    expect((await request(app, 'POST', path, intent, { email: 'invitee@example.com' })).status).toBe(401);
    const created = await request(app, 'POST', path, { ...intent, cookie: adminCookie }, { email: 'Invitee@example.com' });
    expect(created.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    const link = new URL(created.body.link);
    expect(link.origin).toBe('https://photos.example.com');
    expect(link.pathname).toBe('/signin');
    expect(link.search).toBe('');
    const token = new URLSearchParams(link.hash.slice(1)).get('invite')!;
    expect(token).toHaveLength(43);
    for (let i = 0; i < 2; i++) {
      const inspected = await request(app, 'POST', '/api/auth/email/invitation/inspect', intent, { token });
      expect(inspected.body).toEqual({ email: 'invitee@example.com' });
      expect(inspected.headers.get('cache-control')).toBe('no-store');
    }
    expect(accounts.getByEmail('invitee@example.com')?.access_status).toBe('pending');
    expect(send).not.toHaveBeenCalled();
    expect((await request(app, 'GET', '/api/feed')).status).toBe(401);
    expect((await request(app, 'POST', '/api/auth/email/invitation/accept', {}, { token })).status).toBe(403);
    const accepted = await request(app, 'POST', '/api/auth/email/invitation/accept', intent, { token, email: 'attacker@example.com' });
    expect(accepted.status).toBe(200);
    expect(accepted.headers.get('set-cookie') ?? '').not.toContain('foldergram_email_session');
    const mail = JSON.parse(send.mock.calls.at(-1)![1].body);
    expect(mail.to).toEqual(['invitee@example.com']);
    expect((await request(app, 'POST', '/api/auth/email/invitation/accept', intent, { token })).status).toBe(400);
    expect(send).toHaveBeenCalledTimes(1);
    const verification = new URLSearchParams(new URL(mail.text.match(/https:[^\s]+/)[0]).hash.slice(1)).get('token');
    expect((await request(app, 'POST', '/api/auth/email/inspect', intent, { token: verification })).body.firstSignIn).toBe(true);
    const confirmed = await request(app, 'POST', '/api/auth/email/confirm', intent, { token: verification, screenName: '  Friendly <Photographer>  ' });
    expect(confirmed.status).toBe(200);
    const cookie = cookieFrom(confirmed.headers, 'foldergram_email_session');
    expect((await request(app, 'GET', '/api/auth/status', { cookie })).body.user.displayName).toBe('Friendly <Photographer>');
    const repeatToken = await linkFor('invitee@example.com');
    expect((await request(app, 'POST', '/api/auth/email/inspect', intent, { token: repeatToken })).body.firstSignIn).toBe(false);
    await request(app, 'POST', '/api/auth/email/confirm', intent, { token: repeatToken, screenName: 'Changed by old link' });
    expect(accounts.getByEmail('invitee@example.com')?.display_name).toBe('Friendly <Photographer>');
  });

  it('keeps screen-name onboarding disabled by default and ignores submitted names in this phase', async () => {
    accounts.approve('simple@example.com', 'Simple');
    const token = await linkFor('simple@example.com');
    expect((await request(app, 'POST', '/api/auth/email/inspect', intent, { token })).body.firstSignIn).toBe(false);
    const result = await request(app, 'POST', '/api/auth/email/confirm', intent, { token, screenName: 'Not enabled yet' });
    expect(result.status).toBe(200);
    expect(accounts.getByEmail('simple@example.com')?.display_name).toBe('Community member');
    const cookie = cookieFrom(result.headers, 'foldergram_email_session');
    expect((await request(app, 'GET', '/api/auth/status', { cookie })).body.user.displayName).toBe('simple');
    expect((await request(app, 'GET', '/api/admin/users', { cookie: adminCookie })).body.items[0].display_name).toBe('simple');
    const { appConfig } = await import('../src/config/env.js');
    appConfig.emailScreenNamesEnabled = true;
    expect((await request(app, 'GET', '/api/auth/status', { cookie })).body.user.displayName).toBe('Community member');

  });

  it('invalidates replaced, expired, banned and old-admin-version invitations', async () => {
    async function invite() {
      const result = await request(app, 'POST', '/api/admin/users/invitations', { ...intent, cookie: adminCookie }, { email: 'invited@example.com' });
      expect(result.status).toBe(200);
      return new URLSearchParams(new URL(result.body.link).hash.slice(1)).get('invite')!;
    }
    const first = await invite(); const second = await invite();
    const inspect = (token: string) => request(app, 'POST', '/api/auth/email/invitation/inspect', intent, { token });
    expect((await inspect(first)).status).toBe(400);
    expect((await inspect(second)).status).toBe(200);
    const { databaseManager } = await import('../src/db/database.js');
    databaseManager.connection.prepare('UPDATE email_invitations SET expires_at = 0').run();
    expect((await inspect(second)).status).toBe(400);
    const third = await invite();
    accounts.revoke(accounts.getByEmail('invited@example.com')!.id);
    expect((await inspect(third)).status).toBe(400);
    expect((await request(app, 'POST', '/api/admin/users/invitations', { ...intent, cookie: adminCookie }, { email: 'invited@example.com' })).status).toBe(409);
    accounts.approve('invited@example.com', 'Invited');
    const fourth = await invite();
    auth.setAdminPassword('new-admin-password-123');
    expect((await inspect(fourth)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('brands the email front door before Vue boots, independently of the library theme', async () => {
    const { FOLDER_DISPLAY_THEME_SETTING_KEY } = await import('../src/constants/app-setting-keys.js');
    repo.appSettingsRepository.set(FOLDER_DISPLAY_THEME_SETTING_KEY, 'classic');
    for (const url of ['/', '/signin', '/admin', '/access/review']) {
      const page = await request(app, 'GET', url);
      expect(page.status).toBe(200);
      expect(page.body).toContain('<html class="email-auth-entry"');
      expect(page.body).toContain('<title>UnReeled Photos</title>');
      expect(page.body).toContain('<p>Loading UnReeled Photos…</p>');
      expect(page.body).not.toContain('data-cinema-entry="true"');
      expect(page.headers.get('cache-control')).toBe('no-store');
      if (url === '/') {
        expect(page.body).toContain('property="og:image" content="https://photos.example.com/branding/ur-invitation-card-v1.png"');
        expect(page.body).toContain('A closer look at the good times.');
        expect(page.body).toContain('property="og:image:width" content="1200"');
        const spoofed = await request(app, 'GET', '/', { Host: 'evil.example', 'X-Forwarded-Host': 'evil.example' });
        expect(spoofed.body).toContain('property="og:image" content="https://photos.example.com/branding/ur-invitation-card-v1.png"');
      } else {
        expect(page.body).not.toContain('property="og:image"');
      }
    }
    const { appConfig } = await import('../src/config/env.js');
    appConfig.emailSignInEnabled = false;
    expect((await request(app, 'GET', '/signin')).status).toBe(404);
    const classicAlbum = await request(app, 'GET', '/f/album');
    expect(classicAlbum.body).toContain('<html lang="en">');
    expect(classicAlbum.body).toContain('<title>Foldergram</title>');
  });

  it('brands Reels using the feed theme independently of the album theme', async () => {
    const { FEED_DISPLAY_THEME_SETTING_KEY, FOLDER_DISPLAY_THEME_SETTING_KEY } = await import('../src/constants/app-setting-keys.js');
    repo.appSettingsRepository.set(FEED_DISPLAY_THEME_SETTING_KEY, 'cinema');
    repo.appSettingsRepository.set(FOLDER_DISPLAY_THEME_SETTING_KEY, 'classic');
    const cinema = await request(app, 'GET', '/reels');
    expect(cinema.status).toBe(200);
    expect(cinema.body).toContain('data-cinema-entry="true"');
    expect(cinema.body).toContain('<p>Loading reels…</p>');
    expect(cinema.body).toContain('<title>UnReeled Photos</title>');
    repo.appSettingsRepository.set(FEED_DISPLAY_THEME_SETTING_KEY, 'classic');
    repo.appSettingsRepository.set(FOLDER_DISPLAY_THEME_SETTING_KEY, 'cinema');
    const classic = await request(app, 'GET', '/reels');
    expect(classic.body).not.toContain('data-cinema-entry="true"');
    expect(classic.body).toContain('<title>Foldergram</title>');
  });

  async function ownerReviewFor(email: string) {
    const { appConfig } = await import('../src/config/env.js');
    appConfig.emailAccessReviewTo = 'owner@example.com';
    expect((await request(app, 'POST', '/api/auth/email/request', intent, { email })).status).toBe(202);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const notification = JSON.parse(send.mock.calls[0][1].body);
    expect(notification.to).toEqual(['owner@example.com']);
    const link = new URL(notification.text.match(/https:[^\s]+/)[0]);
    expect(link.origin).toBe('https://photos.example.com');
    return new URLSearchParams(link.hash.slice(1)).get('token')!;
  }

  it('emails the owner and approves a single request without login, while keeping scanners and replay harmless', async () => {
    const token = await ownerReviewFor('remote@example.com');
    const pending = accounts.getByEmail('remote@example.com')!;
    expect(pending.access_status).toBe('pending');
    const missingIntent = await request(app, 'POST', '/api/auth/email/review/confirm', {}, { token, decision: 'approve' });
    expect(missingIntent.status).toBe(403);
    expect((await request(app, 'GET', '/api/auth/email/review/confirm')).status).toBe(401);
    for (let i = 0; i < 2; i++) {
      const inspect = await request(app, 'POST', '/api/auth/email/review/inspect', intent, { token });
      expect(inspect.body).toEqual({ email: pending.email });
      expect(inspect.headers.get('cache-control')).toBe('no-store');
    }
    expect(accounts.getById(pending.id)?.access_status).toBe('pending'); expect(send).toHaveBeenCalledTimes(1);
    const confirmed = await request(app, 'POST', '/api/auth/email/review/confirm', intent, { token, decision: 'approve' });
    expect(confirmed.body).toEqual({ decision: 'approve', emailSent: true });
    expect(confirmed.headers.get('set-cookie')).toBeNull();
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[1][1].body).to).toEqual([pending.email]);
    expect((await request(app, 'GET', '/api/admin/users')).status).toBe(401);
    expect((await request(app, 'POST', '/api/auth/email/review/confirm', intent, { token, decision: 'deny' })).status).toBe(400);
    expect(accounts.getById(pending.id)?.access_status).toBe('approved');
  });
  it('denies a request from an email link without sending a visitor email or allowing a replay', async () => {
    const token = await ownerReviewFor('denied@example.com');
    const result = await request(app, 'POST', '/api/auth/email/review/confirm', intent, { token, decision: 'deny' });
    expect(result.body).toEqual({ decision: 'deny', emailSent: false });
    expect(accounts.getByEmail('denied@example.com')).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await request(app, 'POST', '/api/auth/email/review/confirm', intent, { token, decision: 'approve' })).status).toBe(400);
  });
  it('rejects owner email decisions after the admin password changes', async () => {
    const token = await ownerReviewFor('password-reset@example.com');
    auth.setAdminPassword('replacement-password-123');
    expect((await request(app, 'POST', '/api/auth/email/review/inspect', intent, { token })).status).toBe(400);
    expect((await request(app, 'POST', '/api/auth/email/review/confirm', intent, { token, decision: 'approve' })).status).toBe(400);
    expect(accounts.getByEmail('password-reset@example.com')?.access_status).toBe('pending');
  });

  it('requires admin approval, sends only to approved addresses, and keeps unknown/revoked responses identical', async () => {
    (await import('../src/config/env.js')).appConfig.nodeEnv = 'production';
    expect((await request(app, 'POST', '/api/admin/users', intent, { email: 'family@example.com', displayName: 'Family' })).status).toBe(401);
    const approve = await request(app, 'POST', '/api/admin/users', { ...intent, cookie: adminCookie }, { email: ' FAMILY@example.com ', displayName: 'Family' });
    expect(approve.status).toBe(200);
    const unknown = await request(app, 'POST', '/api/auth/email/request', intent, { email: 'unknown@example.com' });
    const token = await linkFor('family@example.com');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(send.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only-key');
    const delivered = JSON.parse(send.mock.calls[0][1].body);
    expect(delivered.from).toBe('UnReeled Photos <photos@example.com>');
    expect(delivered.subject).toBe('Your UnReeled Photos sign-in link');
    expect(delivered.text).toContain("You're almost in!");
    expect(delivered.html).not.toContain('Click the link below');
    expect(delivered.html).toContain('>Sign in to UnReeled Photos</a>');
    expect(delivered.html).toContain('src="cid:unreeled-logo"');
    expect(delivered.attachments[0]).toMatchObject({ filename: 'unreeled-photos.png', content_type: 'image/png', content_id: 'unreeled-logo' });
    expect(Buffer.from(delivered.attachments[0].content, 'base64').subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(Buffer.from(delivered.attachments[0].content, 'base64')[25]).toBe(6); // RGBA email logo.
    expect(delivered.html).toContain('prefers-color-scheme:dark');
    expect(delivered.html).toContain('class="ur-email__button"');
    const limitedKnown = await request(app, 'POST', '/api/auth/email/request', intent, { email: 'family@example.com' });
    const limitedUnknown = await request(app, 'POST', '/api/auth/email/request', intent, { email: 'unknown@example.com' });
    expect(limitedKnown.status).toBe(429); expect(limitedUnknown.status).toBe(429);
    expect(limitedUnknown.body).toEqual(limitedKnown.body);
    accounts.revoke(approve.body.user.id);
    expect((await request(app, 'POST', '/api/auth/email/request', intent, { email: 'family@example.com' })).body).toEqual(limitedKnown.body);
    expect((await request(app, 'POST', '/api/auth/email/confirm', intent, { token })).status).toBe(400);
    expect(unknown.headers.get('cache-control')).toBe('no-store');
  });

  it.each(['development', 'test'] as const)('allows repeated links in %s despite an existing production cooldown', async (mode) => {
    (await import('../src/config/env.js')).appConfig.nodeEnv = mode;
    accounts.approve('testing@example.com', 'Testing');
    const { reserveEmailSignInRequest } = await import('../src/services/email-sign-in-service.js');
    reserveEmailSignInRequest('testing@example.com');
    const { databaseManager } = await import('../src/db/database.js');
    databaseManager.connection.exec('UPDATE email_sign_in_limits SET requests = 5');
    for (let attempt = 0; attempt < 6; attempt++) await linkFor('testing@example.com');
    expect(send).toHaveBeenCalledTimes(6);
    expect(databaseManager.connection.prepare('SELECT requests FROM email_sign_in_limits').get()!.requests).toBe(5);
  });

  it('reports per-address cooldown and hourly limits before acknowledging a send', async () => {
    (await import('../src/config/env.js')).appConfig.nodeEnv = 'production';
    accounts.approve('cooldown@example.com', 'Cooldown');
    await linkFor('cooldown@example.com');
    const cooldown = await request(app, 'POST', '/api/auth/email/request', intent, { email: ' COOLDOWN@example.com ' });
    expect(cooldown.status).toBe(429);
    expect(cooldown.body.message).toContain('wait about 1 minute');
    expect(Number(cooldown.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(send).toHaveBeenCalledTimes(1);
    const { databaseManager } = await import('../src/db/database.js');
    databaseManager.connection.prepare('UPDATE email_sign_in_limits SET last_requested_at = ?, requests = 5').run(Date.now() - 60_001);
    const hourly = await request(app, 'POST', '/api/auth/email/request', intent, { email: 'cooldown@example.com' });
    expect(hourly.status).toBe(429);
    expect(Number(hourly.headers.get('retry-after'))).toBeGreaterThan(3500);
    expect(hourly.body.message).toContain('60 minutes');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('queues new addresses without email, then approves and sends the first sign-in link once', async () => {
    const submitted = await request(app, 'POST', '/api/auth/email/request', intent, { email: ' New@example.com ' });
    expect(submitted.status).toBe(202);
    await vi.waitFor(() => expect(accounts.getByEmail('new@example.com')?.access_status).toBe('pending'));
    expect(send).not.toHaveBeenCalled();
    const pending = accounts.getByEmail('new@example.com')!;
    const list = await request(app, 'GET', '/api/admin/users', { cookie: adminCookie });
    expect(list.body.items).toContainEqual(expect.objectContaining({ id: pending.id, access_status: 'pending' }));
    expect((await request(app, 'POST', `/api/admin/users/${pending.id}/approve`, intent, {})).status).toBe(401);
    expect((await request(app, 'POST', `/api/admin/users/${pending.id}/approve`, { cookie: adminCookie }, {})).status).toBe(403);
    const approved = await request(app, 'POST', `/api/admin/users/${pending.id}/approve`, { ...intent, cookie: adminCookie }, { displayName: 'New Person' });
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ user: { id: pending.id, access_status: 'approved', display_name: 'New Person' }, emailSent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const duplicate = await request(app, 'POST', `/api/admin/users/${pending.id}/approve`, { ...intent, cookie: adminCookie }, {});
    expect(duplicate.status).toBe(409); expect(send).toHaveBeenCalledTimes(1);
    const mail = JSON.parse(send.mock.calls[0][1].body);
    const token = new URL(mail.text.match(/https:[^\s]+/)[0]).hash.slice('#token='.length);
    const confirm = await request(app, 'POST', '/api/auth/email/confirm', intent, { token });
    expect(confirm.status).toBe(200);
  });

  it('rejects a pending request without preventing a later new request', async () => {
    accounts.requestAccess('rejected@example.com');
    const pending = accounts.getByEmail('rejected@example.com')!;
    expect((await request(app, 'POST', `/api/admin/users/${pending.id}/reject`, intent)).status).toBe(401);
    expect((await request(app, 'POST', `/api/admin/users/${pending.id}/reject`, { cookie: adminCookie })).status).toBe(403);
    expect((await request(app, 'POST', `/api/admin/users/${pending.id}/reject`, { ...intent, cookie: adminCookie })).status).toBe(200);
    expect(accounts.getByEmail(pending.email)).toBeUndefined();
    const again = await request(app, 'POST', '/api/auth/email/request', intent, { email: pending.email });
    expect(again.status).toBe(202);
    await vi.waitFor(() => expect(accounts.getByEmail(pending.email)?.access_status).toBe('pending'));
    expect(accounts.getByEmail(pending.email)?.id).not.toBe(pending.id);
    expect(send).not.toHaveBeenCalled();
    expect((await request(app, 'POST', `/api/admin/users/${pending.id}/reject`, { ...intent, cookie: adminCookie })).status).toBe(409);
  });

  it('never deletes an approved account through a stale rejection action', async () => {
    accounts.requestAccess('concurrent@example.com');
    const user = accounts.getByEmail('concurrent@example.com')!;
    accounts.approveRequest(user.id);
    expect((await request(app, 'POST', `/api/admin/users/${user.id}/reject`, { ...intent, cookie: adminCookie }, {})).status).toBe(409);
    expect(accounts.getById(user.id)?.access_status).toBe('approved');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports approval separately from a failed email delivery', async () => {
    accounts.requestAccess('new@example.com');
    const pending = accounts.getByEmail('new@example.com')!;
    send.mockResolvedValueOnce(new Response('private-provider-details', { status: 503 }));
    const result = await request(app, 'POST', `/api/admin/users/${pending.id}/approve`, { ...intent, cookie: adminCookie }, {});
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ user: { access_status: 'approved' }, emailSent: false });
    expect(JSON.stringify(result.body)).not.toContain('private-provider-details');
    const { databaseManager } = await import('../src/db/database.js');
    expect(databaseManager.connection.prepare('SELECT COUNT(*) AS count FROM email_sign_in_tokens').get()!.count).toBe(0);
  });

  it('confirms once, issues an HttpOnly Secure 90-day cookie, preserves admin login, and blocks admin APIs', async () => {
    accounts.approve('family@example.com', 'Family');
    const { cookie, token, response } = await signIn('family@example.com');
    expect(cookie).toMatch(/^foldergram_email_session=.+/);
    const headers = response.headers.get('set-cookie')!;
    expect(headers).toContain('Max-Age=7776000');
    expect(headers).toContain('HttpOnly'); expect(headers).toContain('Secure'); expect(headers).toContain('SameSite=Lax');
    const status = await request(app, 'GET', '/api/auth/status', { cookie });
    expect(status.body).toMatchObject({ authenticated: true, role: 'viewer', accessMode: 'email', likesMode: 'personal', user: { email: 'family@example.com', displayName: 'family' },
      capabilities: { canManageLibrary: false, canAccessSettings: false, canUseSharedCollections: false } });
    expect((await request(app, 'GET', '/api/feed', { cookie })).status).toBe(200);
    expect((await request(app, 'GET', '/api/admin/users', { cookie })).status).toBe(403);
    expect((await request(app, 'DELETE', `/api/admin/users/${accounts.getByEmail('family@example.com')!.id}`, { ...intent, cookie })).status).toBe(403);
    expect((await request(app, 'POST', '/api/admin/users', { ...intent, cookie }, { email: 'other@example.com', displayName: 'Other' })).status).toBe(403);
    expect((await request(app, 'GET', '/api/collections', { cookie })).status).toBe(403);
    expect((await request(app, 'POST', '/api/auth/email/confirm', intent, { token })).status).toBe(400);
    expect((await request(app, 'GET', '/api/auth/status', { cookie: adminCookie })).body.role).toBe('admin');
  });

  it('deletes an account, signs it out immediately, and never revives old sessions when it rejoins', async () => {
    const user = accounts.approve('family@example.com', 'Family');
    const signedIn = await signIn(user.email);
    const revoke = await request(app, 'DELETE', `/api/admin/users/${user.id}`, { ...intent, cookie: adminCookie });
    expect(revoke.status).toBe(200);
    expect((await request(app, 'GET', '/api/feed', { cookie: signedIn.cookie })).status).toBe(401);
    expect(accounts.getById(user.id)).toBeUndefined();
    const replacement = accounts.approve(user.email, 'Family');
    expect(replacement.id).not.toBe(user.id);
    expect((await request(app, 'GET', '/api/feed', { cookie: signedIn.cookie })).status).toBe(401);
  });

  it('isolates personal likes between accounts and retains the admin’s existing shared likes', async () => {
    accounts.approve('one@example.com', 'One'); accounts.approve('two@example.com', 'Two');
    const one = await signIn('one@example.com'); const two = await signIn('two@example.com');
    expect((await request(app, 'POST', `/api/posts/${postId}/like`, { ...intent, cookie: one.cookie })).status).toBe(200);
    expect((await request(app, 'GET', '/api/likes', { cookie: one.cookie })).body.items.map((item: any) => item.id)).toEqual([postId]);
    expect((await request(app, 'GET', '/api/likes', { cookie: one.cookie })).body.items[0].isSaved).toBe(false);
    expect((await request(app, 'GET', '/api/likes', { cookie: two.cookie })).body.items).toEqual([]);
    expect((await request(app, 'GET', '/api/likes', { cookie: adminCookie })).body.items).toEqual([]);
    await request(app, 'POST', `/api/posts/${postId}/like`, { ...intent, cookie: adminCookie });
    await request(app, 'DELETE', `/api/posts/${postId}/like`, { ...intent, cookie: two.cookie });
    expect((await request(app, 'GET', '/api/likes', { cookie: one.cookie })).body.items).toHaveLength(1);
    expect((await request(app, 'GET', '/api/likes', { cookie: adminCookie })).body.items).toHaveLength(1);
    const logout = await request(app, 'POST', '/api/auth/logout', { ...intent, cookie: one.cookie });
    expect(logout.status).toBe(200);
    expect((await request(app, 'GET', '/api/likes', { cookie: one.cookie })).status).toBe(401);
  });

  it('invalidates links when Resend rejects delivery without returning provider details', async () => {
    accounts.approve('family@example.com', 'Family');
    send.mockResolvedValueOnce(new Response('private-provider-details', { status: 503 }));
    const token = await linkFor('family@example.com');
    await vi.waitFor(async () => {
      const response = await request(app, 'POST', '/api/auth/email/inspect', intent, { token });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).not.toContain('private-provider-details');
    });
  });

  it('requires CSRF intent, returns generic expired-link errors, and ignores forged viewer cookies', async () => {
    expect((await request(app, 'POST', '/api/auth/email/request', {}, { email: 'family@example.com' })).status).toBe(403);
    expect((await request(app, 'POST', '/api/auth/email/confirm', { ...intent, origin: 'https://evil.example' }, { token: 'a'.repeat(43) })).status).toBe(403);
    const response = await request(app, 'POST', '/api/auth/email/inspect', intent, { token: 'a'.repeat(43) });
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await request(app, 'GET', '/api/feed', { cookie: 'foldergram_email_session=forged' })).status).toBe(401);
    expect((await request(app, 'GET', '/api/feed')).status).toBe(401);
  });

  it('disables public/password viewer access in email mode and fails closed when auth storage is missing', async () => {
    repo.appSettingsRepository.set('auth.viewer_access_mode', 'public'); auth.refresh();
    expect(auth.isPublicViewerAccessEnabled()).toBe(false);
    expect(() => auth.setViewerAccess('public')).toThrow(/configured by the server/);
    expect((await request(app, 'GET', '/api/feed')).status).toBe(401);
    const { AUTH_PASSWORD_HASH_SETTING_KEY } = await import('../src/constants/app-setting-keys.js');
    repo.appSettingsRepository.remove(AUTH_PASSWORD_HASH_SETTING_KEY); auth.refresh();
    expect((await request(app, 'POST', '/api/auth/email/request', intent, { email: 'family@example.com' })).status).toBe(503);
    expect((await request(app, 'GET', '/api/feed', { cookie: adminCookie })).status).toBe(503);
  });
});

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schemaSql } from '../src/db/schema.js';
import { createEmailSignInService } from '../src/services/email-sign-in-service.js';

const state = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock('../src/db/database.js', () => ({ databaseManager: { get connection() { return state.db!; } } }));
import { emailAccountRepository as accounts } from '../src/db/email-account-repository.js';
import { folderRepository, postRepository, maintenanceRepository, likeRepository } from '../src/db/repositories.js';
import { withRequestUser } from '../src/services/request-user.js';

describe('email account persistence', () => {
  beforeEach(() => { state.db = new DatabaseSync(':memory:'); state.db.exec(schemaSql); });
  afterEach(() => state.db?.close());

  function postIn(folderName: string, filename: string) {
    const folder = folderRepository.upsert({ slug: folderName, name: folderName, folderPath: folderName });
    return postRepository.upsertPost({ folderId: folder.id, sourcePath: `${folderName}/${filename}`, postType: 'single', sortTimestamp: 1 });
  }

  it.each(['deletePost', 'deletePostAndImages'] as const)('cleans every account’s personal likes through %s without FK cascades', method => {
    state.db!.exec('PRAGMA foreign_keys = OFF');
    const first = accounts.approve('first@example.com', 'First');
    const second = accounts.approve('second@example.com', 'Second');
    const removed = postIn('album', 'removed.jpg');
    const kept = postIn('other', 'kept.jpg');
    for (const user of [first, second]) withRequestUser(user.id, () => {
      likeRepository.upsert(removed.id); likeRepository.upsert(kept.id);
    });
    expect(postRepository[method](removed.id)?.id).toBe(removed.id);
    for (const user of [first, second]) withRequestUser(user.id, () => {
      expect(likeRepository.getByPostId(removed.id)).toBeUndefined();
      expect(likeRepository.getByPostId(kept.id)).toBeDefined();
    });
  });

  it('cleans personal likes for a deleted folder without touching other albums when FK cascades are off', () => {
    state.db!.exec('PRAGMA foreign_keys = OFF');
    const user = accounts.approve('family@example.com', 'Family');
    const removed = postIn('removed', 'photo.jpg');
    const kept = postIn('kept', 'photo.jpg');
    withRequestUser(user.id, () => {
      likeRepository.upsert(removed.id); likeRepository.upsert(kept.id);
      folderRepository.delete(removed.folder_id);
      expect(likeRepository.getByPostId(removed.id)).toBeUndefined();
      expect(likeRepository.getByPostId(kept.id)).toBeDefined();
    });
  });

  it('does not attach personal likes to reused post IDs after an index reset with FK cascades off', () => {
    state.db!.exec('PRAGMA foreign_keys = OFF');
    const user = accounts.approve('family@example.com', 'Family');
    accounts.createSignInToken(user.id, 'link', Date.now() + 60_000);
    accounts.redeem('link', 'session', 1, Date.now() + 60_000);
    const oldPost = postIn('old', 'old.jpg');
    withRequestUser(user.id, () => likeRepository.upsert(oldPost.id));
    maintenanceRepository.resetLibraryIndex();
    const newPost = postIn('new', 'unrelated.jpg');
    expect(newPost.id).toBe(oldPost.id);
    withRequestUser(user.id, () => expect(likeRepository.getByPostId(newPost.id)).toBeUndefined());
    expect(accounts.getSessionUser('session', 1)?.id).toBe(user.id);
    expect(accounts.getById(user.id)?.email).toBe(user.email);
  });

  it('migrates existing approvals and revoked identities without losing their data', () => {
    const legacy = new DatabaseSync(':memory:');
    try {
      legacy.exec(`CREATE TABLE library_users (id INTEGER PRIMARY KEY, email TEXT, display_name TEXT, revoked_at INTEGER, created_at INTEGER, last_signed_in_at INTEGER);
        INSERT INTO library_users VALUES (11, 'approved@example.com', 'Approved', NULL, 1, 2), (12, 'revoked@example.com', 'Revoked', 3, 1, 2);`);
      const migration = readFileSync(new URL('../db/migrations/000008_add_access_requests.sql', import.meta.url), 'utf8').split('-- migrate:down')[0];
      legacy.exec(migration);
      const rows = legacy.prepare('SELECT id, email, access_status, last_signed_in_at FROM library_users ORDER BY id').all();
      expect(rows).toEqual([
        { id: 11, email: 'approved@example.com', access_status: 'approved', last_signed_in_at: 2 },
        { id: 12, email: 'revoked@example.com', access_status: 'banned', last_signed_in_at: 2 }
      ]);
    } finally { legacy.close(); }
  });

  it('distinguishes a personal invitation from a later public access request', () => {
    accounts.createInvitation('invited@example.com', 'invitation', 1, Date.now() + 60_000);
    expect(accounts.getByEmail('invited@example.com')?.requested_at).toBeNull();
    accounts.requestAccess('invited@example.com');
    expect(accounts.getByEmail('invited@example.com')?.requested_at).toEqual(expect.any(Number));
  });

  it('deletes only the chosen account and all its credentials and likes even without FK cascades', () => {
    const db = state.db!;
    db.exec('PRAGMA foreign_keys = OFF');
    const user = accounts.approve('delete@example.com', 'Delete Me');
    const other = accounts.approve('keep@example.com', 'Keep Me');
    accounts.createSignInToken(user.id, 'session-link', Date.now() + 60_000);
    accounts.redeem('session-link', 'session', 1, Date.now() + 60_000);
    accounts.createSignInToken(user.id, 'unused-link', Date.now() + 60_000);
    accounts.createInvitation(user.email, 'invitation', 1, Date.now() + 60_000);
    db.prepare('INSERT INTO email_access_reviews (token_hash, user_id, auth_version, reviewer_hash, expires_at, created_at) VALUES (?, ?, 1, ?, ?, ?)')
      .run('review', user.id, 'reviewer', Date.now() + 60_000, Date.now());
    for (const id of [user.id, other.id]) db.prepare('INSERT INTO user_likes (user_id, post_id, created_at) VALUES (?, 123, ?)').run(id, Date.now());
    expect(accounts.deleteUser(user.id)).toBe(true);
    expect(accounts.getById(user.id)).toBeUndefined();
    expect(accounts.getById(other.id)?.email).toBe(other.email);
    for (const table of ['library_user_sessions', 'email_sign_in_tokens', 'email_access_reviews', 'email_invitations', 'user_likes']) {
      expect(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`).get(user.id)?.count).toBe(0);
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM user_likes WHERE user_id = ?').get(other.id)?.count).toBe(1);
    expect(accounts.deleteUser(user.id)).toBe(false);
    accounts.requestAccess(user.email);
    expect(accounts.getByEmail(user.email)?.id).not.toBe(user.id);
    expect(accounts.getByEmail(user.email)?.access_status).toBe('pending');
    expect(accounts.getSessionUser('session', 1)).toBeUndefined();
    expect(accounts.getSignInUser('unused-link')).toBeUndefined();
  });

  it('keeps the same identity when a revoked address is approved again', () => {
    const user = accounts.approve('family@example.com', 'Family');
    expect(accounts.getByEmail('FAMILY@example.com')?.id).toBe(user.id);
    accounts.revoke(user.id);
    expect(accounts.getByEmail(user.email)?.revoked_at).not.toBeNull();
    const restored = accounts.approve(user.email, 'New name');
    expect(restored).toMatchObject({ id: user.id, display_name: 'New name', revoked_at: null });
  });

  it('deduplicates pending requests, blocks authentication, and preserves bans', () => {
    accounts.requestAccess('new@example.com');
    const pending = accounts.getByEmail('new@example.com')!;
    expect(pending.access_status).toBe('pending');
    accounts.requestAccess(pending.email);
    expect(accounts.list()).toHaveLength(1);
    expect(accounts.getByEmail(pending.email)?.id).toBe(pending.id);
    accounts.createSignInToken(pending.id, 'pending-token', Date.now() + 60_000);
    expect(accounts.getSignInUser('pending-token')).toBeUndefined();
    accounts.revoke(pending.id);
    accounts.requestAccess(pending.email);
    expect(accounts.getByEmail(pending.email)?.access_status).toBe('banned');
    expect(accounts.list()).toHaveLength(1);
    expect(accounts.approveRequest(pending.id, 'New Person')).toMatchObject({ access_status: 'approved', display_name: 'New Person', revoked_at: null });
    expect(accounts.approveRequest(pending.id)).toBeUndefined();
  });

  it('bounds the pending queue while allowing existing requests to be updated and resolved', () => {
    for (let i = 0; i < 1000; i++) accounts.requestAccess(`person${i}@example.com`);
    accounts.requestAccess('overflow@example.com');
    expect(accounts.getByEmail('overflow@example.com')).toBeUndefined();
    accounts.requestAccess('person0@example.com');
    const first = accounts.getByEmail('person0@example.com')!;
    accounts.revoke(first.id);
    accounts.requestAccess('overflow@example.com');
    expect(accounts.getByEmail('overflow@example.com')?.access_status).toBe('pending');
    expect(accounts.getByEmail(first.email)?.access_status).toBe('banned');
  });

  it('redeems a token only once and binds the persistent session to the account and auth version', () => {
    const user = accounts.approve('family@example.com', 'Family');
    accounts.createSignInToken(user.id, 'link-hash', Date.now() + 60_000);
    expect(accounts.redeem('link-hash', 'session-hash', 1, Date.now() + 60_000)?.id).toBe(user.id);
    expect(accounts.redeem('link-hash', 'second-session', 1, Date.now() + 60_000)).toBeNull();
    expect(accounts.getSessionUser('session-hash', 1)?.id).toBe(user.id);
    expect(accounts.getSessionUser('session-hash', 2)).toBeUndefined();
    accounts.deleteSession('session-hash');
    expect(accounts.getSessionUser('session-hash', 1)).toBeUndefined();
  });

  it('rolls token consumption back if session creation fails', () => {
    const user = accounts.approve('family@example.com', 'Family');
    accounts.createSignInToken(user.id, 'first', Date.now() + 60_000);
    accounts.redeem('first', 'existing-session', 1, Date.now() + 60_000);
    accounts.createSignInToken(user.id, 'second', Date.now() + 60_000);
    expect(() => accounts.redeem('second', 'existing-session', 1, Date.now() + 60_000)).toThrow();
    expect(accounts.getSignInUser('second')?.id).toBe(user.id);
    expect(accounts.redeem('second', 'new-session', 1, Date.now() + 60_000)?.id).toBe(user.id);
  });

  it('revokes all browser sessions and outstanding links without deleting the identity', () => {
    const user = accounts.approve('family@example.com', 'Family');
    for (const key of ['one', 'two']) {
      accounts.createSignInToken(user.id, key, Date.now() + 60_000);
      accounts.redeem(key, key, 1, Date.now() + 60_000);
    }
    accounts.createSignInToken(user.id, 'pending', Date.now() + 60_000);
    expect(accounts.revoke(user.id)).toBe(true);
    expect(accounts.getSessionUser('one', 1)).toBeUndefined();
    expect(accounts.getSessionUser('two', 1)).toBeUndefined();
    expect(accounts.redeem('pending', 'three', 1, Date.now() + 60_000)).toBeNull();
    accounts.approve(user.email, 'Family');
    expect(accounts.getSessionUser('one', 1)).toBeUndefined();
    expect(accounts.getSignInUser('pending')).toBeUndefined();
  });

  it('rejects expired links and sessions and cleans expired records', () => {
    const user = accounts.approve('family@example.com', 'Family');
    accounts.createSignInToken(user.id, 'expired', Date.now() - 1);
    expect(accounts.redeem('expired', 'session', 1, Date.now() + 60_000)).toBeNull();
    accounts.createSignInToken(user.id, 'valid', Date.now() + 60_000);
    accounts.redeem('valid', 'session', 1, Date.now() - 1);
    expect(accounts.getSessionUser('session', 1)).toBeUndefined();
  });

  it('limits requests per address across service restarts without retaining the address', () => {
    const now = Date.now();
    expect(accounts.allowRequest('address-hash', now)).toBe(true);
    expect(accounts.reserveRequest('address-hash', now + 59_999)).toBe(1);
    for (let minute = 1; minute <= 4; minute++) expect(accounts.allowRequest('address-hash', now + minute * 60_000)).toBe(true);
    expect(accounts.reserveRequest('address-hash', now + 5 * 60_000)).toBe(3300);
    expect(accounts.allowRequest('address-hash', now + 60 * 60_000)).toBe(true);
    expect(accounts.allowRequest('other-hash', now)).toBe(true);
  });

  it('does not create sign-in tokens for revoked or missing accounts', () => {
    const user = accounts.approve('family@example.com', 'Family');
    accounts.revoke(user.id);
    accounts.createSignInToken(user.id, 'revoked', Date.now() + 60_000);
    accounts.createSignInToken(9999, 'missing', Date.now() + 60_000);
    expect(accounts.getSignInUser('revoked')).toBeUndefined();
    expect(accounts.getSignInUser('missing')).toBeUndefined();
  });
});


describe('email sign-in credentials', () => {
  beforeEach(() => { state.db = new DatabaseSync(':memory:'); state.db.exec(schemaSql); });
  afterEach(() => state.db?.close());

  function setup(rateLimitEnabled = true) {
    const send = vi.fn().mockResolvedValue(undefined);
    const service = createEmailSignInService({ origin: 'https://photos.example.com', sessionDurationMs: 90 * 86400_000, rateLimitEnabled, sendEmail: send });
    const user = accounts.approve('family@example.com', 'Family');
    return { send, service, user };
  }

  it('sends a configured-origin fragment link and stores only hashed credentials', async () => {
    const { send, service, user } = setup();
    await service.requestLink(' FAMILY@example.com ');
    const text = send.mock.calls[0][0].text;
    const rawLink = text.match(/https:[^\s]+/)[0];
    const url = new URL(rawLink);
    expect(url.origin).toBe('https://photos.example.com');
    expect(url.pathname).toBe('/signin');
    expect(url.search).toBe('');
    const token = new URLSearchParams(url.hash.slice(1)).get('token')!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(service.inspectLink(token)?.id).toBe(user.id);
    const stored = state.db!.prepare('SELECT token_hash FROM email_sign_in_tokens').get()!;
    expect(stored.token_hash).not.toContain(token);
    const result = service.redeemLink(token, 7)!;
    expect(result.user.id).toBe(user.id);
    expect(service.getSessionUser(result.sessionToken, 7)?.id).toBe(user.id);
    expect(service.getSessionUser(result.sessionToken, 8)).toBeNull();
    expect(service.inspectLink(token)).toBeNull();
    expect(service.redeemLink(token, 7)).toBeNull();
    service.signOut(result.sessionToken);
    expect(service.getSessionUser(result.sessionToken, 7)).toBeNull();
  });

  it('keeps new links valid for 24 hours, expires at the boundary, and consumes them once', async () => {
    const { service, send, user } = setup(false);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await service.sendApprovedLink(user.email);
      const message = send.mock.calls[0][0];
      expect(message.text).toContain('expires in 24 hours');
      expect(message.html).toContain('expires in 24 hours');
      const token = new URLSearchParams(new URL(message.text.match(/https:[^\s]+/)[0]).hash.slice(1)).get('token')!;
      const stored = state.db!.prepare('SELECT expires_at FROM email_sign_in_tokens').get()!;
      expect(stored.expires_at).toBe(now + 24 * 60 * 60_000);
      vi.mocked(Date.now).mockReturnValue(now + 23 * 60 * 60_000);
      expect(service.inspectLink(token)?.id).toBe(user.id);
      vi.mocked(Date.now).mockReturnValue(now + 24 * 60 * 60_000);
      expect(service.inspectLink(token)).toBeNull();
      expect(service.redeemLink(token, 1)).toBeNull();
      await service.sendApprovedLink(user.email);
      const fresh = new URLSearchParams(new URL(send.mock.calls[1][0].text.match(/https:[^\s]+/)[0]).hash.slice(1)).get('token')!;
      expect(service.redeemLink(fresh, 1)?.user.id).toBe(user.id);
      expect(service.redeemLink(fresh, 1)).toBeNull();
    } finally { vi.restoreAllMocks(); }
  });

  it('allows direct service retries when rate limiting is disabled', async () => {
    const { service, send, user } = setup(false);
    await service.requestLink(user.email);
    await service.requestLink(user.email);
    expect(send).toHaveBeenCalledTimes(2);
    expect(state.db!.prepare('SELECT COUNT(*) AS count FROM email_sign_in_limits').get()!.count).toBe(0);
  });

  it('does not send to unknown or revoked addresses or resend during the cooldown', async () => {
    const { send, service, user } = setup();
    await service.requestLink('unknown@example.com');
    expect(send).not.toHaveBeenCalled();
    await service.requestLink(user.email);
    await service.requestLink(user.email);
    expect(send).toHaveBeenCalledTimes(1);
    accounts.revoke(user.id);
    await service.requestLink(user.email);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('discards failed deliveries and keeps sensitive transport errors private', async () => {
    const { send, service, user } = setup();
    send.mockRejectedValue(new Error('smtp password=secret email=family@example.com'));
    await expect(service.requestLink(user.email)).rejects.toThrow(/^Sign-in email delivery failed\.$/);
    expect(state.db!.prepare('SELECT COUNT(*) AS count FROM email_sign_in_tokens').get()!.count).toBe(0);
  });

  it('rejects malformed credentials and invalid configuration', () => {
    const { service, send } = setup();
    expect(service.inspectLink('invalid')).toBeNull();
    expect(service.redeemLink('../unsafe', 1)).toBeNull();
    expect(service.getSessionUser('invalid', 1)).toBeNull();
    for (const origin of ['https://photos.example.com/path', 'https://user:pass@photos.example.com', 'javascript:alert(1)', 'https://photos.example.com/?x=1']) {
      expect(() => createEmailSignInService({ origin, sessionDurationMs: 1000, sendEmail: send })).toThrow();
    }
    expect(() => createEmailSignInService({ origin: 'https://photos.example.com', sessionDurationMs: 0, sendEmail: send })).toThrow();
  });
});

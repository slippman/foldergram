import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schemaSql } from '../src/db/schema.js';
import { createEmailAccessReviewService } from '../src/services/email-access-review-service.js';
const state = vi.hoisted(() => ({ db: null as DatabaseSync | null }));
vi.mock('../src/db/database.js', () => ({ databaseManager: { get connection() { return state.db!; } } }));
import { emailAccountRepository as accounts } from '../src/db/email-account-repository.js';

describe('emailed access decisions', () => {
  beforeEach(() => { state.db = new DatabaseSync(':memory:'); state.db.exec(schemaSql); });
  afterEach(() => { vi.useRealTimers(); state.db?.close(); });
  const options = { origin: 'https://photos.example.com', reviewTo: 'owner@example.com', authVersion: 1 };
  function setup() {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const service = createEmailAccessReviewService({ ...options, sendEmail });
    accounts.requestAccess('new@example.com');
    const user = accounts.getByEmail('new@example.com')!;
    return { sendEmail, service, user };
  }
  function tokenFrom(sendEmail: ReturnType<typeof vi.fn>) {
    const text = sendEmail.mock.calls[0][0].text;
    const link = new URL(text.match(/https:[^\s]+/)[0]);
    expect(link.origin).toBe(options.origin);
    expect(link.pathname).toBe('/access/review'); expect(link.search).toBe('');
    return new URLSearchParams(link.hash.slice(1)).get('token')!;
  }
  it('sends one owner notification per pending request across service restarts, with only a hashed credential stored', async () => {
    const { service, user, sendEmail } = setup();
    await service.notify(user);
    await createEmailAccessReviewService({ ...options, sendEmail }).notify(user);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: options.reviewTo });
    expect(sendEmail.mock.calls[0][0].html).toContain('>Approve</a>');
    const token = tokenFrom(sendEmail);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(state.db!.prepare('SELECT * FROM email_access_reviews').all())).not.toContain(token);
    expect(service.inspect(token)?.email).toBe(user.email);
    expect(service.inspect(token)?.email).toBe(user.email);
    expect(accounts.getById(user.id)?.access_status).toBe('pending');
    expect(service.decide(token, 'approve')?.id).toBe(user.id);
    expect(accounts.getById(user.id)?.access_status).toBe('approved');
    expect(service.decide(token, 'deny')).toBeNull();
    expect(service.inspect(token)).toBeNull();
    expect(state.db!.prepare('SELECT COUNT(*) AS n FROM library_user_sessions').get()!.n).toBe(0);
  });
  it('denies only its pending request, permits a new request, and never revives the old review link', async () => {
    const { service, user, sendEmail } = setup(); await service.notify(user);
    const token = tokenFrom(sendEmail);
    expect(service.decide(token, 'deny')?.id).toBe(user.id);
    expect(accounts.getById(user.id)).toBeUndefined();
    accounts.requestAccess(user.email);
    const again = accounts.getByEmail(user.email)!;
    expect(again.id).not.toBe(user.id);
    expect(service.decide(token, 'approve')).toBeNull();
    expect(again.access_status).toBe('pending');
  });
  it('rejects expired links and links after owner inbox, origin, password or admin decision changes', async () => {
    const { service, user, sendEmail } = setup(); await service.notify(user);
    const token = tokenFrom(sendEmail);
    for (const changed of [{ reviewTo: 'different@example.com' }, { authVersion: 2 }, { origin: 'https://different.example.com' }]) {
      const other = createEmailAccessReviewService({ ...options, sendEmail, ...changed });
      expect(other.inspect(token)).toBeNull(); expect(other.decide(token, 'approve')).toBeNull();
    }
    expect(service.inspect('bad')).toBeNull();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
    expect(service.inspect(token)).toBeNull(); expect(service.decide(token, 'approve')).toBeNull();
    vi.useRealTimers();
    accounts.revoke(user.id);
    expect(service.decide(token, 'approve')).toBeNull();
    accounts.approve(user.email, 'New');
    expect(service.decide(token, 'deny')).toBeNull();
    expect(accounts.getById(user.id)?.access_status).toBe('approved');
  });
  it('invalidates failed deliveries, suppresses sensitive transport errors, and permits a later retry', async () => {
    const { service, user, sendEmail } = setup(); sendEmail.mockRejectedValueOnce(new Error('secret-recipient-or-key'));
    await expect(service.notify(user)).rejects.toThrow(/^Access review email delivery failed\.$/);
    const token = tokenFrom(sendEmail); expect(service.inspect(token)).toBeNull();
    await service.notify(user); expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});

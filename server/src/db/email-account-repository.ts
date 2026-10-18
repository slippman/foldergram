import { databaseManager } from './database.js';

export interface LibraryUser {
  id: number;
  email: string;
  display_name: string;
  access_status: 'pending' | 'approved' | 'banned';
  requested_at: number | null;
  last_requested_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_signed_in_at: number | null;
}

function transaction<T>(work: () => T): T {
  const db = databaseManager.connection;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export const emailAccountRepository = {
  list(): LibraryUser[] {
    return databaseManager.connection.prepare(`SELECT * FROM library_users ORDER BY CASE access_status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC, email COLLATE NOCASE`).all() as unknown as LibraryUser[];
  },
  getByEmail(email: string): LibraryUser | undefined {
    return databaseManager.connection.prepare('SELECT * FROM library_users WHERE email = ?').get(email) as unknown as LibraryUser | undefined;
  },
  getById(id: number): LibraryUser | undefined {
    return databaseManager.connection.prepare('SELECT * FROM library_users WHERE id = ?').get(id) as unknown as LibraryUser | undefined;
  },
  requestAccess(email: string): void {
    const db = databaseManager.connection;
    const now = Date.now();
    db.prepare("UPDATE library_users SET last_requested_at = ?, requested_at = COALESCE(requested_at, ?) WHERE email = ? AND access_status = 'pending'").run(now, now, email);
    // Bound unverified submissions, and never overwrite an approval or a ban.
    db.prepare(`INSERT INTO library_users (email, display_name, access_status, requested_at, last_requested_at, created_at)
      SELECT ?, ?, 'pending', ?, ?, ? WHERE (SELECT COUNT(*) FROM library_users WHERE access_status = 'pending') < 1000
      ON CONFLICT(email) DO NOTHING`).run(email, email.split('@')[0].slice(0, 100), now, now, now);
  },
  approveRequest(id: number, displayName?: string): LibraryUser | undefined {
    return databaseManager.connection.prepare(`UPDATE library_users SET access_status = 'approved', revoked_at = NULL,
      display_name = COALESCE(?, display_name) WHERE id = ? AND access_status IN ('pending', 'banned') RETURNING *`)
      .get(displayName ?? null, id) as unknown as LibraryUser | undefined;
  },
  approve(email: string, displayName: string): LibraryUser {
    databaseManager.connection.prepare(`INSERT INTO library_users (email, display_name, created_at)
      VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, revoked_at = NULL, access_status = 'approved'`)
      .run(email, displayName, Date.now());
    return this.getByEmail(email)!;
  },
  approveInvitation(email: string): LibraryUser | null {
    return transaction(() => {
      const db = databaseManager.connection;
      const existing = this.getByEmail(email);
      if (existing && (existing.access_status === 'banned' || existing.revoked_at !== null)) return null;
      db.prepare(`INSERT INTO library_users (email, display_name, access_status, created_at)
        VALUES (?, 'Community member', 'approved', ?) ON CONFLICT(email) DO UPDATE SET access_status = 'approved'`)
        .run(email, Date.now());
      const user = this.getByEmail(email)!;
      db.prepare('DELETE FROM email_access_reviews WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM email_invitations WHERE user_id = ?').run(user.id);
      return user;
    });
  },
  deleteUser(id: number, pendingOnly = false): boolean {
    return transaction(() => {
      if (pendingOnly && this.getById(id)?.access_status !== 'pending') return false;
      const db = databaseManager.connection;
      // Explicit cleanup also covers installations whose connection predates FK enforcement.
      for (const table of ['library_user_sessions', 'email_sign_in_tokens', 'email_access_reviews', 'email_invitations', 'user_likes']) {
        db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(id);
      }
      return Number(db.prepare('DELETE FROM library_users WHERE id = ?').run(id).changes) > 0;
    });
  },
  revoke(id: number): boolean {
    return transaction(() => {
      const db = databaseManager.connection;
      const result = db.prepare("UPDATE library_users SET revoked_at = ?, access_status = 'banned' WHERE id = ?").run(Date.now(), id);
      db.prepare('DELETE FROM library_user_sessions WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM email_sign_in_tokens WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM email_invitations WHERE user_id = ?').run(id);
      return Number(result.changes) > 0;
    });
  },
  createInvitation(email: string, tokenHash: string, authVersion: number, expiresAt: number): boolean {
    return transaction(() => {
      const db = databaseManager.connection;
      let user = this.getByEmail(email);
      if (user?.access_status === 'banned') return false;
      if (!user) {
        db.prepare(`INSERT INTO library_users (email, display_name, access_status, created_at)
          VALUES (?, 'Community member', 'pending', ?)`).run(email, Date.now());
        user = this.getByEmail(email)!;
      }
      db.prepare('DELETE FROM email_invitations WHERE expires_at <= ? OR user_id = ?').run(Date.now(), user.id);
      db.prepare('INSERT INTO email_invitations (token_hash, user_id, auth_version, expires_at) VALUES (?, ?, ?, ?)')
        .run(tokenHash, user.id, authVersion, expiresAt);
      return true;
    });
  },
  inspectInvitation(tokenHash: string, authVersion: number): LibraryUser | undefined {
    return databaseManager.connection.prepare(`SELECT library_users.* FROM email_invitations
      JOIN library_users ON library_users.id = email_invitations.user_id
      WHERE token_hash = ? AND auth_version = ? AND expires_at > ? AND revoked_at IS NULL AND access_status != 'banned'`)
      .get(tokenHash, authVersion, Date.now()) as unknown as LibraryUser | undefined;
  },
  acceptInvitation(tokenHash: string, authVersion: number): LibraryUser | null {
    return transaction(() => {
      const user = this.inspectInvitation(tokenHash, authVersion);
      if (!user) return null;
      const db = databaseManager.connection;
      db.prepare('DELETE FROM email_invitations WHERE token_hash = ?').run(tokenHash);
      db.prepare("UPDATE library_users SET access_status = 'approved' WHERE id = ?").run(user.id);
      db.prepare('DELETE FROM email_access_reviews WHERE user_id = ?').run(user.id);
      return user;
    });
  },
  claimAccessReview(userId: number, tokenHash: string, authVersion: number, reviewerHash: string, expiresAt: number): boolean {
    const db = databaseManager.connection;
    db.prepare('DELETE FROM email_access_reviews WHERE expires_at <= ?').run(Date.now());
    return Number(db.prepare(`INSERT INTO email_access_reviews (token_hash, user_id, auth_version, reviewer_hash, expires_at, created_at)
      SELECT ?, id, ?, ?, ?, ? FROM library_users WHERE id = ? AND access_status = 'pending'
      ON CONFLICT(user_id) DO NOTHING`).run(tokenHash, authVersion, reviewerHash, expiresAt, Date.now(), userId).changes) === 1;
  },
  discardAccessReview(tokenHash: string): void {
    databaseManager.connection.prepare('DELETE FROM email_access_reviews WHERE token_hash = ?').run(tokenHash);
  },
  getAccessReview(tokenHash: string, authVersion: number, reviewerHash: string): LibraryUser | undefined {
    return databaseManager.connection.prepare(`SELECT library_users.* FROM email_access_reviews
      JOIN library_users ON library_users.id = email_access_reviews.user_id
      WHERE token_hash = ? AND auth_version = ? AND reviewer_hash = ? AND expires_at > ? AND access_status = 'pending'`)
      .get(tokenHash, authVersion, reviewerHash, Date.now()) as unknown as LibraryUser | undefined;
  },
  decideAccessReview(tokenHash: string, authVersion: number, reviewerHash: string, decision: 'approve' | 'deny'): LibraryUser | null {
    return transaction(() => {
      const user = this.getAccessReview(tokenHash, authVersion, reviewerHash);
      if (!user) return null;
      const db = databaseManager.connection;
      db.prepare('DELETE FROM email_access_reviews WHERE token_hash = ?').run(tokenHash);
      if (decision === 'approve') {
        db.prepare("UPDATE library_users SET access_status = 'approved', revoked_at = NULL WHERE id = ? AND access_status = 'pending'").run(user.id);
      } else {
        // Pending requests have no verified identity or sessions. Denial permits a later new request.
        db.prepare("DELETE FROM library_users WHERE id = ? AND access_status = 'pending'").run(user.id);
      }
      return user;
    });
  },
  // Applied equally to all addresses. Rate-limit keys are hashed separately from account/request records.
  reserveRequest(addressHash: string, now = Date.now()): number {
    return transaction(() => {
      const db = databaseManager.connection;
      db.prepare('DELETE FROM email_sign_in_limits WHERE window_started_at <= ?').run(now - 60 * 60 * 1000);
      const existing = db.prepare('SELECT * FROM email_sign_in_limits WHERE address_hash = ?').get(addressHash) as
        { window_started_at: number; last_requested_at: number; requests: number } | undefined;
      if (existing) {
        const retryAt = Math.max(existing.last_requested_at + 60_000,
          existing.requests >= 5 ? existing.window_started_at + 60 * 60_000 : 0);
        if (retryAt > now) return Math.ceil((retryAt - now) / 1000);
      }
      db.prepare(`INSERT INTO email_sign_in_limits (address_hash, window_started_at, last_requested_at, requests)
        VALUES (?, ?, ?, 1) ON CONFLICT(address_hash) DO UPDATE SET last_requested_at = excluded.last_requested_at, requests = requests + 1`)
        .run(addressHash, now, now);
      return 0;
    });
  },
  allowRequest(addressHash: string, now = Date.now()): boolean {
    return this.reserveRequest(addressHash, now) === 0;
  },
  createSignInToken(userId: number, tokenHash: string, expiresAt: number): void {
    const db = databaseManager.connection;
    db.prepare('DELETE FROM email_sign_in_tokens WHERE expires_at <= ?').run(Date.now());
    db.prepare(`INSERT INTO email_sign_in_tokens (token_hash, user_id, expires_at, created_at)
      SELECT ?, id, ?, ? FROM library_users WHERE id = ? AND revoked_at IS NULL AND access_status = 'approved'`)
      .run(tokenHash, expiresAt, Date.now(), userId);
  },
  discardSignInToken(tokenHash: string): void {
    databaseManager.connection.prepare('DELETE FROM email_sign_in_tokens WHERE token_hash = ?').run(tokenHash);
  },
  getSignInUser(tokenHash: string, now = Date.now()): LibraryUser | undefined {
    return databaseManager.connection.prepare(`SELECT library_users.* FROM email_sign_in_tokens
      JOIN library_users ON library_users.id = email_sign_in_tokens.user_id
      WHERE token_hash = ? AND expires_at > ? AND revoked_at IS NULL AND access_status = 'approved'`).get(tokenHash, now) as unknown as LibraryUser | undefined;
  },
  redeem(tokenHash: string, sessionHash: string, authVersion: number, expiresAt: number, screenName?: string): LibraryUser | null {
    return transaction(() => {
      const user = this.getSignInUser(tokenHash);
      if (!user) return null;
      const db = databaseManager.connection;
      db.prepare('DELETE FROM email_sign_in_tokens WHERE token_hash = ?').run(tokenHash);
      db.prepare('DELETE FROM library_user_sessions WHERE expires_at <= ?').run(Date.now());
      db.prepare(`INSERT INTO library_user_sessions (token_hash, user_id, auth_version, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(sessionHash, user.id, authVersion, expiresAt, Date.now());
      if (user.last_signed_in_at === null) {
        db.prepare('UPDATE library_users SET display_name = ? WHERE id = ?').run(screenName?.trim() || 'Community member', user.id);
      }
      db.prepare('UPDATE library_users SET last_signed_in_at = ? WHERE id = ?').run(Date.now(), user.id);
      return this.getById(user.id)!;
    });
  },
  getSessionUser(sessionHash: string, authVersion: number): LibraryUser | undefined {
    return databaseManager.connection.prepare(`SELECT library_users.* FROM library_user_sessions
      JOIN library_users ON library_users.id = library_user_sessions.user_id
      WHERE token_hash = ? AND auth_version = ? AND expires_at > ? AND revoked_at IS NULL AND access_status = 'approved'`)
      .get(sessionHash, authVersion, Date.now()) as unknown as LibraryUser | undefined;
  },
  deleteSession(sessionHash: string): void {
    databaseManager.connection.prepare('DELETE FROM library_user_sessions WHERE token_hash = ?').run(sessionHash);
  }
};

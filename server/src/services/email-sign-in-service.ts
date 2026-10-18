import { createHash, randomBytes } from 'node:crypto';
import { emailAccountRepository, type LibraryUser } from '../db/email-account-repository.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LINK_DURATION_MS = 24 * 60 * 60_000;
export const EMAIL_SIGN_IN_NOTICE = 'Check your email inbox or spam folder. First-time access requests require owner approval before a sign-in email can be sent.';

export interface SignInEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inlineLogo?: boolean;
}

export interface EmailSignInOptions {
  origin: string;
  sessionDurationMs: number;
  rateLimitEnabled?: boolean;
  sendEmail: (message: SignInEmail) => Promise<void>;
  onPendingRequest?: (user: LibraryUser) => Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Reserve before HTTP acknowledgment so queued requests cannot silently hit the cooldown. */
export function reserveEmailSignInRequest(email: string, enabled = true): number {
  if (!enabled) return 0;
  return emailAccountRepository.reserveRequest(hashToken(`email-sign-in:${email.trim().toLowerCase()}`));
}

/** Transport and session policy are supplied by configuration, never request headers. */
export function createEmailSignInService(options: EmailSignInOptions) {
  const origin = new URL(options.origin);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Email sign-in requires a configured site origin.');
  }
  if (!Number.isSafeInteger(options.sessionDurationMs) || options.sessionDurationMs <= 0) {
    throw new Error('Email sign-in requires a positive session duration.');
  }
  async function deliverApprovedLink(email: string): Promise<boolean> {
    const user = emailAccountRepository.getByEmail(email);
    if (!user || user.access_status !== 'approved' || user.revoked_at !== null) return false;
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    emailAccountRepository.createSignInToken(user.id, tokenHash, Date.now() + LINK_DURATION_MS);
    // Fragments stay out of server request URLs, access logs and referrers.
    const link = new URL('/signin', origin);
    link.hash = `token=${token}`;
    try {
      await options.sendEmail({
        to: user.email,
        subject: 'Your UnReeled Photos sign-in link',
        text: `Hello from UnReeled Photos\n\nYou're almost in!\n\nSign in to UnReeled Photos:\n${link.href}\n\nThis link expires in 24 hours and can be used once. You will be asked to confirm the account before signing in. If you did not request this email, you can ignore it.`,
        inlineLogo: true,
        html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 24px;font-family:Arial,sans-serif;color:#161616"><table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto"><tr><td align="center" style="padding:0 0 12px"><h1 style="margin:0;font-size:30px;line-height:1.25;font-weight:700">Hello from UnReeled Photos</h1></td></tr><tr><td align="center" style="padding:0 0 28px"><h2 style="margin:0;font-size:24px;line-height:1.3;font-weight:700">You're almost in!</h2></td></tr><tr><td align="center" style="padding:0 0 28px"><a href="${escapeHtml(link.href)}" style="display:inline-block;background:#161616;color:#fff;padding:14px 24px;font-weight:600;text-decoration:none;border-radius:10px">Sign in to UnReeled Photos</a></td></tr><tr><td align="center" style="padding:0 0 28px"><p style="max-width:420px;margin:0 auto;font-size:13px;line-height:1.6;color:#666">This link expires in 24 hours and can be used once. You will be asked to confirm the account before signing in. If you did not request this email, you can ignore it.</p></td></tr><tr><td align="center"><table role="presentation" align="center" width="160" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td align="center"><img src="cid:unreeled-logo" width="160" height="160" alt="UnReeled Photos" style="display:block;width:160px;height:160px;border:0" /></td></tr></table></td></tr></table></td></tr></table>`
      });
    } catch {
      emailAccountRepository.discardSignInToken(tokenHash);
      // Do not propagate transport exceptions, which can contain credentials, addresses or tokens.
      throw new Error('Sign-in email delivery failed.');
    }
    return true;
  }
  return {
    async requestLink(email: string, rateLimitReserved = false): Promise<void> {
      const normalized = email.trim().toLowerCase();
      if (!rateLimitReserved && reserveEmailSignInRequest(normalized, options.rateLimitEnabled !== false) > 0) return;
      const user = emailAccountRepository.getByEmail(normalized);
      if (!user || user.access_status === 'pending') {
        emailAccountRepository.requestAccess(normalized);
        const pending = emailAccountRepository.getByEmail(normalized);
        if (pending?.access_status === 'pending') await options.onPendingRequest?.(pending);
        return;
      }
      await deliverApprovedLink(normalized);
    },
    sendApprovedLink(email: string): Promise<boolean> {
      return deliverApprovedLink(email.trim().toLowerCase());
    },
    inspectLink(token: string): LibraryUser | null {
      return TOKEN_PATTERN.test(token) ? emailAccountRepository.getSignInUser(hashToken(token)) ?? null : null;
    },
    redeemLink(token: string, authVersion: number, screenName?: string): { user: LibraryUser; sessionToken: string; expiresAt: number } | null {
      if (!TOKEN_PATTERN.test(token)) return null;
      const sessionToken = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + options.sessionDurationMs;
      const user = emailAccountRepository.redeem(hashToken(token), hashToken(sessionToken), authVersion, expiresAt, screenName);
      return user ? { user, sessionToken, expiresAt } : null;
    },
    getSessionUser(token: string, authVersion: number): LibraryUser | null {
      return TOKEN_PATTERN.test(token) ? emailAccountRepository.getSessionUser(hashToken(token), authVersion) ?? null : null;
    },
    signOut(token: string): void {
      if (TOKEN_PATTERN.test(token)) emailAccountRepository.deleteSession(hashToken(token));
    }
  };
}

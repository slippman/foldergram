import { createHash, randomBytes } from 'node:crypto';
import { emailAccountRepository, type LibraryUser } from '../db/email-account-repository.js';
import type { SignInEmail } from './email-sign-in-service.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REVIEW_DURATION_MS = 24 * 60 * 60_000;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** A bearer credential authorizes exactly one pending request, never an admin session. */
export function createEmailAccessReviewService(options: {
  origin: string;
  reviewTo: string;
  authVersion: number;
  sendEmail: (message: SignInEmail) => Promise<void>;
}) {
  const origin = new URL(options.origin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Access review requires a configured site origin.');
  // Changing the reviewer inbox, origin or admin password invalidates old review links.
  const reviewerHash = hash(`${origin.origin}\n${options.reviewTo.trim().toLowerCase()}`);
  return {
    async notify(user: LibraryUser): Promise<void> {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hash(token);
      if (!emailAccountRepository.claimAccessReview(user.id, tokenHash, options.authVersion, reviewerHash, Date.now() + REVIEW_DURATION_MS)) return;
      const link = (decision: 'approve' | 'deny') => {
        const url = new URL('/access/review', origin);
        url.hash = new URLSearchParams({ token, decision }).toString();
        return url.href;
      };
      try {
        await options.sendEmail({
          to: options.reviewTo,
          subject: 'UnReeled Photos: access request',
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#161616;text-align:center"><h1 style="font-size:24px">UnReeled Photos</h1><h2 style="font-size:20px">Access request</h2><p><strong>${escapeHtml(user.email)}</strong> would like to join.</p><p style="margin:28px 0"><a href="${escapeHtml(link('approve'))}" style="display:inline-block;background:#161616;color:#fff;padding:14px 22px;text-decoration:none;border-radius:10px;margin:0 6px 12px">Approve</a><a href="${escapeHtml(link('deny'))}" style="display:inline-block;background:#161616;color:#fff;padding:14px 22px;text-decoration:none;border-radius:10px;margin:0 6px 12px">Deny</a></p><p style="font-size:13px;color:#666">Links expire in 24 hours.</p></div>`,
          text: `${user.email} would like to join UnReeled Photos.\n\nApprove:\n${link('approve')}\n\nDeny:\n${link('deny')}\n\nLinks expire in 24 hours.`
        });
      } catch {
        emailAccountRepository.discardAccessReview(tokenHash);
        throw new Error('Access review email delivery failed.');
      }
    },
    inspect(token: string): LibraryUser | null {
      return TOKEN_PATTERN.test(token) ? emailAccountRepository.getAccessReview(hash(token), options.authVersion, reviewerHash) ?? null : null;
    },
    decide(token: string, decision: 'approve' | 'deny'): LibraryUser | null {
      return TOKEN_PATTERN.test(token) ? emailAccountRepository.decideAccessReview(hash(token), options.authVersion, reviewerHash, decision) : null;
    }
  };
}

import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import pLimit from 'p-limit';
import { z } from 'zod';
import { appConfig } from '../config/env.js';
import { emailAccountRepository } from '../db/email-account-repository.js';
import { requireCapability } from '../middleware/auth-protection.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { authService } from '../services/auth-service.js';
import { EMAIL_SIGN_IN_NOTICE, reserveEmailSignInRequest } from '../services/email-sign-in-service.js';
import { getEmailAccessReviewService, getEmailSignInService, isAccessReviewConfigured, isEmailDeliveryConfigured } from '../services/resend-service.js';
import { log } from '../services/log-service.js';

export const emailAuthRouter = express.Router();
const sendLimit = pLimit(2);
function productionOnly(limiter: express.RequestHandler): express.RequestHandler {
  return (request, response, next) => {
    if (appConfig.nodeEnv === 'production') return limiter(request, response, next);
    next();
  };
}
const publicLimit = productionOnly(createRateLimiter({ windowMs: 60 * 60_000, max: 60 }));
const approvalLimit = productionOnly(createRateLimiter({ windowMs: 60 * 60_000, max: 60 }));
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const admin = requireCapability('canAccessSettings', 'Admin access is required.');

emailAuthRouter.use(['/auth/email', '/admin/users'], (_request, response, next) => {
  authService.setNoStoreHeaders(response);
  response.vary('Cookie');
  next();
});

function requireEmailDelivery(_request: express.Request, response: express.Response, next: express.NextFunction) {
  if (!isEmailDeliveryConfigured()) {
    response.status(503).json({ message: 'Email sign-in is not available. Please contact the album owner.' });
    return;
  }
  next();
}

emailAuthRouter.post('/auth/email/request', publicLimit, requireEmailDelivery, (request, response) => {
  const { email } = z.object({ email: emailSchema }).parse(request.body);
  const retryAfter = reserveEmailSignInRequest(email, appConfig.nodeEnv === 'production');
  if (retryAfter > 0) {
    const minutes = Math.ceil(retryAfter / 60);
    response.setHeader('Retry-After', String(retryAfter));
    response.status(429).json({ message: `Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} before requesting another sign-in link.` });
    return;
  }
  // Respond identically before checking approval or contacting the provider, avoiding an address oracle.
  response.status(202).json({ message: EMAIL_SIGN_IN_NOTICE });
  setImmediate(() => {
    void sendLimit(() => getEmailSignInService(authService.getSessionVersion()).requestLink(email, true)).catch(() => {
      log.error('Sign-in email delivery failed');
    });
  });
});

emailAuthRouter.post('/auth/email/inspect', publicLimit, requireEmailDelivery, (request, response) => {
  const { token } = tokenSchema.parse(request.body);
  const user = getEmailSignInService().inspectLink(token);
  if (!user) { response.status(400).json({ message: 'This sign-in link is invalid or expired. Please request a new one.' }); return; }
  response.json({ email: user.email, displayName: appConfig.emailScreenNamesEnabled ? user.display_name : user.email.split('@')[0], firstSignIn: appConfig.emailScreenNamesEnabled && user.last_signed_in_at === null });
});

emailAuthRouter.post('/auth/email/confirm', publicLimit, requireEmailDelivery, (request, response) => {
  const { token, screenName } = tokenSchema.extend({ screenName: z.string().trim().max(100).optional() }).parse(request.body);
  const result = getEmailSignInService().redeemLink(token, authService.getSessionVersion(), appConfig.emailScreenNamesEnabled ? screenName : undefined);
  if (!result) { response.status(400).json({ message: 'This sign-in link is invalid or expired. Please request a new one.' }); return; }
  authService.setEmailSession(response, request, result.sessionToken);
  // Read the new account identity without trusting the request's old cookies.
  response.json({ ok: true });
});

// These public endpoints accept a narrowly scoped review credential, never a user id or email.
function requireAccessReview(_request: express.Request, response: express.Response, next: express.NextFunction) {
  if (!isAccessReviewConfigured()) { response.status(503).json({ message: 'Email access review is unavailable.' }); return; }
  next();
}
emailAuthRouter.post('/auth/email/review/inspect', publicLimit, requireAccessReview, (request, response) => {
  const { token } = tokenSchema.parse(request.body);
  const user = getEmailAccessReviewService(authService.getSessionVersion()).inspect(token);
  if (!user) { response.status(400).json({ message: 'This review link is invalid, expired or already used.' }); return; }
  response.json({ email: user.email });
});
emailAuthRouter.post('/auth/email/review/confirm', publicLimit, requireAccessReview, async (request, response) => {
  const { token, decision } = tokenSchema.extend({ decision: z.enum(['approve', 'deny']) }).parse(request.body);
  const user = getEmailAccessReviewService(authService.getSessionVersion()).decide(token, decision);
  if (!user) { response.status(400).json({ message: 'This review link is invalid, expired or already used.' }); return; }
  let emailSent = false;
  if (decision === 'approve') {
    try { emailSent = await sendLimit(() => getEmailSignInService().sendApprovedLink(user.email)); }
    catch { log.error('Approved account sign-in email delivery failed'); }
  }
  response.json({ decision, emailSent });
});

emailAuthRouter.get('/admin/users', admin, (_request, response) => {
  response.json({ items: emailAccountRepository.list().map(user => ({ ...user, display_name: appConfig.emailScreenNamesEnabled ? user.display_name : user.email.split('@')[0] })), emailSignInEnabled: appConfig.emailSignInEnabled,
    deliveryConfigured: isEmailDeliveryConfigured(), reviewEmailConfigured: isAccessReviewConfigured(), sessionDays: 90 });
});
emailAuthRouter.post('/admin/users', admin, (request, response) => {
  const body = z.object({ email: emailSchema, displayName: z.string().trim().min(1).max(100) }).parse(request.body);
  response.json({ user: emailAccountRepository.approve(body.email, body.displayName) });
});
emailAuthRouter.post('/admin/users/:id/approve', admin, approvalLimit, requireEmailDelivery, async (request, response) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const { displayName } = z.object({ displayName: z.string().trim().min(1).max(100).optional() }).parse(request.body);
  const user = emailAccountRepository.approveRequest(id, displayName);
  if (!user) { response.status(409).json({ message: 'This request is no longer pending approval.' }); return; }
  let emailSent = false;
  try { emailSent = await sendLimit(() => getEmailSignInService().sendApprovedLink(user.email)); }
  catch { log.error('Approved account sign-in email delivery failed'); }
  response.json({ user, emailSent });
});
emailAuthRouter.post('/admin/users/:id/reject', admin, (request, response) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  if (!emailAccountRepository.deleteUser(id, true)) {
    response.status(409).json({ message: 'This request is no longer pending. Refresh the list.' }); return;
  }
  response.json({ ok: true });
});
emailAuthRouter.delete('/admin/users/:id', admin, (request, response) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  if (!emailAccountRepository.deleteUser(id)) { response.status(404).json({ message: 'Account not found.' }); return; }
  response.json({ ok: true });
});

const invitationHash = (token: string) => createHash('sha256').update(token).digest('hex');
emailAuthRouter.post('/admin/users/invitations/send', admin, approvalLimit, requireEmailDelivery, async (request, response) => {
  const { email } = z.object({ email: emailSchema }).parse(request.body);
  const user = emailAccountRepository.approveInvitation(email);
  if (!user) { response.status(409).json({ message: 'Delete this existing blocked account before inviting it again.' }); return; }
  try {
    const emailSent = await sendLimit(() => getEmailSignInService().sendApprovedLink(user.email));
    if (!emailSent) throw new Error('Unavailable');
    response.json({ emailSent: true });
  } catch {
    log.error('Invitation email delivery failed');
    response.status(503).json({ message: 'Access is approved, but the invitation email could not be sent. Please try again.' });
  }
});
emailAuthRouter.post('/admin/users/invitations', admin, approvalLimit, requireEmailDelivery, (request, response) => {
  const { email } = z.object({ email: emailSchema }).parse(request.body);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60_000;
  if (!emailAccountRepository.createInvitation(email, invitationHash(token), authService.getSessionVersion(), expiresAt)) {
    response.status(409).json({ message: 'Delete this existing blocked account before creating a new invitation.' }); return;
  }
  const link = new URL('/signin', appConfig.emailSignInOrigin!);
  link.hash = `invite=${token}`;
  response.json({ link: link.href, expiresAt });
});
emailAuthRouter.post('/auth/email/invitation/inspect', publicLimit, requireEmailDelivery, (request, response) => {
  const { token } = tokenSchema.parse(request.body);
  const user = emailAccountRepository.inspectInvitation(invitationHash(token), authService.getSessionVersion());
  if (!user) { response.status(400).json({ message: 'This invitation is invalid, expired or already used.' }); return; }
  response.json({ email: user.email });
});
emailAuthRouter.post('/auth/email/invitation/accept', publicLimit, requireEmailDelivery, async (request, response) => {
  const { token } = tokenSchema.parse(request.body);
  const user = emailAccountRepository.inspectInvitation(invitationHash(token), authService.getSessionVersion());
  if (!user) { response.status(400).json({ message: 'This invitation is invalid, expired or already used.' }); return; }
  const retryAfter = reserveEmailSignInRequest(user.email, appConfig.nodeEnv === 'production');
  if (retryAfter > 0) { response.setHeader('Retry-After', String(retryAfter)); response.status(429).json({ message: 'Please wait before requesting another email.' }); return; }
  const accepted = emailAccountRepository.acceptInvitation(invitationHash(token), authService.getSessionVersion());
  if (!accepted) { response.status(400).json({ message: 'This invitation is invalid, expired or already used.' }); return; }
  try {
    const sent = await sendLimit(() => getEmailSignInService().sendApprovedLink(accepted.email));
    if (!sent) throw new Error('Unavailable');
    response.json({ ok: true });
  } catch {
    // Approval persists, so ordinary sign-in can retry a failed delivery without a new invitation.
    response.status(503).json({ message: 'Your invitation was accepted, but email delivery failed. Use another email address below to return to sign-in and request a new link for this address.' });
  }
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createEmailAccessReviewService } from './email-access-review-service.js';
import { appConfig, repositoryRoot } from '../config/env.js';
import { createEmailSignInService, type SignInEmail } from './email-sign-in-service.js';

export const EMAIL_SESSION_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(appConfig.emailSignInEnabled && appConfig.emailSignInOrigin && appConfig.emailFrom && appConfig.resendApiKey);
}

export async function sendSignInEmail(message: SignInEmail): Promise<void> {
  if (!isEmailDeliveryConfigured()) throw new Error('Sign-in email delivery is not configured.');
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${appConfig.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `UnReeled Photos <${appConfig.emailFrom}>`, to: [message.to], subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}),
        ...(message.inlineLogo ? { attachments: [{
          filename: 'unreeled-photos.png', content_type: 'image/png', content_id: 'unreeled-logo',
          content: readFileSync(path.join(repositoryRoot, 'client/public/branding/ur-email-logo-945346a88a1a.png')).toString('base64')
        }] } : {}) })
    });
    // Never log provider bodies: they can contain recipients, content or credentials.
    await response.body?.cancel();
    if (!response.ok) throw new Error('Delivery rejected.');
  } catch {
    throw new Error('Sign-in email delivery failed.');
  }
}

export function isAccessReviewConfigured(): boolean {
  return Boolean(isEmailDeliveryConfigured() && appConfig.emailAccessReviewTo);
}

export function getEmailAccessReviewService(authVersion: number) {
  if (!isAccessReviewConfigured()) throw new Error('Access review email is not configured.');
  return createEmailAccessReviewService({ origin: appConfig.emailSignInOrigin!, reviewTo: appConfig.emailAccessReviewTo!, authVersion, sendEmail: sendSignInEmail });
}

export function getEmailSignInService(authVersion?: number) {
  if (!isEmailDeliveryConfigured()) throw new Error('Sign-in email delivery is not configured.');
  return createEmailSignInService({
    origin: appConfig.emailSignInOrigin!,
    sessionDurationMs: EMAIL_SESSION_DURATION_MS,
    rateLimitEnabled: appConfig.nodeEnv === 'production',
    onPendingRequest: authVersion !== undefined && isAccessReviewConfigured()
      ? user => getEmailAccessReviewService(authVersion).notify(user) : undefined,
    sendEmail: sendSignInEmail
  });
}

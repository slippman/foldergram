---
title: Email sign-in
description: Owner-approved email access with Resend and persistent personal accounts.
---

# Email sign-in and access requests

Email sign-in is optional. A new visitor submits their address on the sign-in
page, creating a pending request in **Settings → Security & Access → Access
requests**. The owner can **Approve request** or **Reject Request**. Approval
sends the first verification email; pending requests do not send mail. The visitor
opens the link and confirms the displayed account. Entering an address or owner
approval alone never signs someone in. Pending addresses have not been verified. After submitting, dismissing the inbox
popup opens a waiting page without the request form. Refreshing that page does
not send another email; visitors can explicitly choose another address if needed.

The admin list refreshes every 15 seconds while visible and also has a refresh
button. Repeated submissions are grouped by normalized address. Rejecting a request
removes it; the person may request access again later. To invite someone proactively,
use **Send invitation**. This sends their verification email immediately, without a
separate approval form or intermediate invitation-acceptance page.

Sign-in links expire after 24 hours and work once. Sessions last a fixed 90 days
from sign-in on each browser; using the site does not extend them. **Delete user**
asks for confirmation, then permanently removes that account, its personal likes,
and all sessions, sign-in links, invitations and owner review links. It does not
delete media, other accounts or shared/admin likes. The same address may request
access again, creating a new account; old credentials cannot access the new one.
Signing out invalidates only that browser's session. There is no Ban/Unban control
in this interface. Existing legacy blocked records remain blocked until deleted.

Account likes persist on the server and are separate for each person. Existing
admin/shared likes are retained separately. Cinema feed and album headers have an
account avatar that opens the current user name and sign-out action. The More
menu also identifies the current account. Email-mode guests on shared Cinema
albums see a Sign in button. Avatars use local initials; no email address is sent
to an external avatar service. Collections for email visitors remain
browser-local. Comments and per-album library visibility are separate features;
this first email-access implementation grants the existing full-library view.

Album share links and album passwords continue to grant their existing scoped
access without email sign-in. Email accounts do not grant administration rights.
The owner's existing admin password remains available on the dedicated administrator sign-in page.

## Resend setup

1. Create a [Resend account](https://resend.com/) and verify a sending domain using
   the DNS records Resend provides. Follow its [domain instructions](https://resend.com/docs/dashboard/domains/introduction).
   Use a From address on that domain. Sending verification does not require moving
   your personal inbox to Resend; do not replace existing incoming-mail MX records
   with unrelated sending records.
2. Create a [sending-only API key](https://resend.com/docs/dashboard/api-keys/introduction),
   restricted to that domain when possible. Store it in the server's private
   environment configuration. Never put it in client code, chat, Git, or logs.
3. Initialize the existing admin password privately before enabling email mode.
   Email mode requires initialized authentication even if `AUTH_REQUIRED=false`.
4. Configure the following settings and restart the service:

   ```dotenv
   EMAIL_SIGN_IN_ENABLED=true
   EMAIL_SIGN_IN_ORIGIN=https://photos.example.com
   EMAIL_FROM=photos@example.com
   RESEND_API_KEY=your-private-sending-key
   ```

   The bundled Compose file passes these settings from its environment/`.env`.
   Other deployments must pass them explicitly. The origin is a trusted,
   administrator-configured site origin, with no path, credentials, query, or
   fragment; HTTPS is required in production. Links never use request Host or
   forwarded-host headers. Configure each installation's actual origin: production
   links must point at production, and development links at development.
5. Have one test visitor submit their address, then approve their request as admin. Check delivery in Resend and verify sign-in, sign-out, and
   account deletion before approving more people. No emails are sent merely by starting
   the app. Approving a pending request or sending an invitation sends mail.

When email mode is enabled, legacy public-library and viewer-password access are
suppressed, including previously issued viewer-password cookies. Existing admin
sessions remain valid. Disabling email mode restores the previous legacy viewer
configuration; account sessions cannot grant access while email mode is disabled.
Keep email mode enabled if you want the library to remain invite-only.
Changing the admin password rotates the auth version and invalidates account
sessions as well as legacy sessions.

## Approve requests from your inbox

Set `EMAIL_ACCESS_REVIEW_TO` to the owner's inbox and restart the service. New
pending requests then send that inbox an **Approve** / **Deny** email through
Resend. Repeated submissions for the same pending request do not send another
notification while its review link remains valid. Existing pending requests can
trigger a notification when the visitor requests again after the cooldown.

These links work without website sign-in. Opening one shows the requesting
address and asks for a confirmation tap; previewing or scanning a link never
makes a decision. Approve sends the visitor a separate mailbox-verification link.
Deny clears that pending request without sending a visitor email and permits a
later request. **Delete user** removes an existing account and its saved likes.

Review links are private bearer credentials scoped to one pending request. They
expire after 24 hours and work once; do not forward them. They grant no library or
admin session. Changing the owner inbox, configured origin or admin password
invalidates old links, as does resolving the request in admin. Admin approval and
deletion controls remain available if notifications fail or links expire. Requests are
subject to the public endpoint and per-address limits in production. Notification
and sign-in delivery errors are reported without exposing provider details.

## Security and delivery behavior

Only hashes of random sign-in and session credentials are stored in SQLite.
Session cookies are HttpOnly and SameSite=Lax, and are Secure on HTTPS.
The emailed token is in a URL fragment, removed from the browser address before
verification, and consumed only after explicit account confirmation. Request,
inspection, and confirmation APIs require the existing mutation-intent/CSRF checks
and return uncached responses. Public requests acknowledge approved and unknown
addresses identically before doing approval checks or contacting Resend. Banned
addresses receive the same acknowledgment. New unverified requests are capped at
1,000 pending addresses; approval or rejection frees a pending slot.

In production (`NODE_ENV=production`), each address is limited to one request per
minute and five per hour, persisted
across restarts. The request API reserves this allowance before acknowledging a
request. If the address is cooling down or has reached its hourly limit, it returns
HTTP 429 with `Retry-After` and a wait-time message, and the page displays that
instead of the inbox popup. The same limits and responses apply to approved,
pending, unknown, and banned addresses. A separate IP-based limit applies to the email endpoints; behind
proxies it can act as a shared bucket under the existing deployment configuration.
Email-specific per-address and IP limits are bypassed in development and test
mode, including any existing saved cooldowns. They remain enabled in production;
approval, account deletion, mailbox verification, and link expiration still apply in every mode.
This change does not add proxy-trust configuration. Delivery is queued in memory;
a process restart can lose queued mail, so request a new link if needed. Failed
provider deliveries invalidate their tokens. Server logs omit recipient addresses,
credentials, tokens, and provider response bodies. Resend processes the recipient
address and sign-in message as the selected email-delivery provider.

Revocation stops authenticated library requests immediately. Previously issued
signed media URLs and browser/CDN copies follow the existing finite media-cache
policy; revocation cannot erase those cached bytes. Back up SQLite and the existing
share recovery key as usual. Original-media GPS metadata is unchanged.


### Personal invitations and screen names

In Security & Access, **Invite someone → Send invitation** approves the specified
email address and sends its sign-in email directly. The recipient opens that email
and confirms their account to sign in; there is no intermediate link that asks them
to request another email. The verification link expires after 24 hours and works
once. Entering the address or sending the email never creates a visitor session.
Inviting an existing account preserves its identity, chosen name and likes.
People who have not signed in yet are marked **Invited** in the people list.

If delivery fails, approval remains and the owner can retry Send invitation; the
page reports failure rather than claiming mail was sent. Deleting an account
invalidates its credentials. Legacy blocked records must be deleted before a new
invitation can be sent. Sending a direct invitation invalidates that account's old
pending review and personal invitation credentials.

Previously issued seven-day personal invitation links continue to work until
used, expired, replaced, or invalidated. They retain their existing inspection and
acceptance flow; the admin interface now sends verification emails directly.

Cinema shared albums offer **Sign in / Sign up**. Guests can continue viewing the
shared album with its existing link, but cannot browse the protected feed. Ordinary
new sign-ups still require owner approval; the album link itself never grants it.

Screen-name onboarding is disabled for the initial rollout. Existing chosen names
are preserved internally. During this phase, the account menu and admin people list
use the portion before `@` as the user name, such as `seth_lippman`. Account menus
show that name alone; the admin people list also retains the full contact address. The implementation and
translations remain available for a later phase. To enable the optional step for
new users, set `EMAIL_SCREEN_NAMES_ENABLED=true` and restart the service. It defaults
to `false`; the server both hides the step and ignores submitted screen names while
disabled. Users who already signed in during this phase will not be prompted on
returning sign-ins; collecting their names later requires a separate profile step.

When enabled, on first mailbox verification visitors may enter an optional screen name. The
suggestion is their first and last name, but they may choose any name up to 100
characters. Skipping uses **Community member**, rather than deriving a public name
from their email. Returning sign-ins retain the chosen name and do not repeat this
step. This name is intended for future public likes and comments; commenting is
not implemented by this change. Email remains available to the account owner and
administrator, but is not intended as the public attribution for those features.

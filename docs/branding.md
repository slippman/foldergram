---
title: Branding map
description: UnReeled Photos logo assets, usage locations, and replacement checklist.
---

# UnReeled Photos branding map

Last audited: October 17, 2026. Keep this inventory current whenever a logo,
favicon, branded email, or branding reference is added, removed, or renamed.
This is the maintained reference for a future branding update.

## Assets

All UR image assets live in `client/public/branding/`.

| Asset | Purpose |
| --- | --- |
| `ur-logo-4e4dc1180945.png` | Current full UR logo; shared by website and sign-in emails. |
| `ur-favicon-9a5af93327d1.svg` | Current website favicon. |
| `ur-favicon-9a5af93327d1-32.png` | Current 32px favicon fallback. |
| `ur-favicon-9a5af93327d1-16.png` | Current 16px favicon fallback. |
| `ur-favicon-5e7c17f7ff6b.svg` | Earlier favicon, still referenced by the local static preview. |
| `ur-favicon-5e7c17f7ff6b-32.png`, `ur-favicon-5e7c17f7ff6b-16.png` | Earlier favicon fallbacks retained alongside that variant. |

The public URL prefix is `/branding/`. `server/src/app.ts` serves this directory
with **one-year immutable caching**, using `client/public/branding/` in development
and the build copy in `client/dist/branding/` in production. Use new versioned
filenames when replacing assets; overwriting an existing URL can leave visitors
seeing the old logo. Current filename identifiers are not all hashes of their
current file bytes, so do not assume they can be regenerated from that alone.

## Every full-logo use

| Location | Where the logo appears | Size / behavior |
| --- | --- | --- |
| `client/index.html` | Startup splash before Vue loads, for Cinema album entry and the email front door. | 144px; hidden in the Classic splash. |
| `client/src/views/SharedFolderView.vue` | Shared Cinema album loading screen. | 144px; Cinema branch only. |
| `client/src/components/AlbumAttribution.vue` | Cinema attribution footer. | 144px desktop, 112px mobile; links to `https://slip.unreeled.com`. |
| `client/src/components/EmailSignIn.vue` | Public email sign-in card and post-request waiting page. | 112px; same component and logo. |
| `client/src/views/EmailAccessReviewView.vue` | Owner approval/denial page and its result screen. | 112px. |
| `server/src/services/resend-service.ts` | Reads the same PNG and embeds it in sign-in email as a base64 inline attachment. | Attachment filename `unreeled-photos.png`, content ID `unreeled-logo`. |
| `server/src/services/email-sign-in-service.ts` | Places the email logo at the bottom, after the sign-in link and small print. | 160px, using `src="cid:unreeled-logo"`; must match the transport content ID. |

The attribution component is included by:

- `client/src/views/FolderView.vue`: standard Cinema albums.
- `client/src/views/SharedFolderView.vue`: shared Cinema albums.
- `client/src/views/HomeView.vue`: end of the loaded Cinema home feed.

Owner notification emails in `server/src/services/email-access-review-service.ts`
currently use the **UnReeled Photos text name**, without an image logo.

The Cinema account controls in `CinemaAccountMenu.vue` and `AccountIdentity.vue`
use local text initials inside a circle, not the UR logo or an external avatar
service. The header and More-menu identity displays share this account styling.

## Favicons, startup branding, and theme treatment

| Location | Responsibility |
| --- | --- |
| `client/src/utils/favicon.ts` | Maps the three default favicon URLs to the current UR favicon URLs, and restores Classic icons when appropriate. |
| `client/src/App.vue` | Chooses when to apply UR favicons and document titles: Cinema pages and the explicitly branded email front door. |
| `server/src/routes/share-preview.ts` | Sets initial favicon URLs and title before JavaScript; selects `shared-album-entry` or `email-auth-entry` startup branding. |
| `client/vite.config.ts` | Routes email front-door HTML through the backend during development so initial branding is present before Vue boots. |
| `client/index.html` | Startup logo sizing, light/dark filters, blend mode, and the default Classic favicon links. |
| `client/src/components/AppShell.vue` | Shared Cinema `--ur-logo-filter` / `--ur-logo-blend` variables for light and dark themes. |
| `AlbumAttribution.vue`, `SharedFolderView.vue`, `EmailSignIn.vue`, `EmailAccessReviewView.vue` | Component logo sizing and/or theme filters. |

Email sign-in and owner-review dark-mode filters must target only their scoped
logo classes. Keep the root theme selector outside `:global(...)`: Vue can drop
the trailing logo selector when compiling that form and invert the whole page.
`client/src/utils/branding-styles.test.ts` checks the compiled selectors.

The current artwork uses multiply blending on light backgrounds and inversion /
screen blending in dark themes. A new transparent, colored, or already-dark logo
may need different CSS; review these rules as well as changing the image.

## Related brand name and email copy

The Cinema shared-album guest teaser lives in `CinemaGuestTeaser.vue`, with copy
in `share.guestTeaserTitle` and `share.guestTeaserAction` in the locale files.
The local preview shows it when the guest-header preview is selected.

For a full rename, also review:

- `client/src/components/AlbumHeader.vue`, `client/src/views/HomeView.vue`: 13px, darker gray semibold Cinema name. On desktop it sits beneath the album/feed title on the left, with account controls on the right. On mobile it sits at the left of a slim, softly outlined gray strip when there is no back control, and centers between the back and account controls in scroll views, with the full-width title on the next row and the matching 13px hint above the sticky header divider. The local static preview uses the same header CSS.
- `client/src/utils/document-title.ts`: browser title wording.
- `client/src/locales/en.json`, `es.json`, `zh.json`: email sign-in name and copy.
- `server/src/routes/share-preview.ts`: initial and shared-album browser titles.
- `server/src/services/resend-service.ts`: sender display name, **UnReeled Photos**.
- `server/src/services/email-sign-in-service.ts`: visitor email subject, welcome
  text, link label, and logo alt text. Greeting: “Hello from UnReeled Photos”,
  followed by “You're almost in!”;
  button: “Sign in to UnReeled Photos”. Both sign-in and owner notification
  emails use centered layouts. The sign-in email uses presentation tables with
  explicit center alignment, including a 160px table for the bottom logo.
- `server/src/services/email-access-review-service.ts`: owner notification name,
  subject, and email text.

The sender mailbox is configured separately through `EMAIL_FROM`; the receiving
owner inbox through `EMAIL_ACCESS_REVIEW_TO`. Neither needs to change for an
artwork-only update. Keep private configuration and API keys out of this document.

## Local previews and preserved upstream artwork

The local-only `foldergram-dev` generator references the logo in attribution,
loading, sign-in, confirmation, waiting, and review previews, and the earlier
favicon in its HTML head. Sign-in and approval email previews derive from the
actual server templates; the sign-in preview substitutes the same local logo for
the email content ID.
Update those references and regenerate with `./foldergram-dev preview`.
`foldergram-preview.html` is generated; do not maintain its copies by hand.
These local tools and generated files remain ignored by Git.

Classic/default app images (`client/public/favicon.svg`, `icon-*.png`), the
inline Foldergram splash SVG in `client/index.html`, PWA metadata in
`client/public/manifest.webmanifest`, and icon cache entries in
`client/public/sw.js` retain upstream branding. The documentation site uses
`docs/public/logo.svg`, referenced by `docs/.vitepress/config.ts`. These are
separate surfaces, not current UR-logo uses; do not replace them as part of a
Cinema-only update without explicit authorization.

## Replacement checklist

1. Add the replacement logo and favicon variants under new filenames in
   `client/public/branding/`.
2. Update all direct references above, including the server email attachment,
   both favicon maps, and local previews. Update this inventory in the same change.
3. Check logo dimensions, light/dark treatment, alt text, footer destination,
   and matching email attachment / HTML content IDs.
4. Verify startup before JavaScript loads, sign-in, owner review, Cinema loading
   and footers, browser favicons, and the HTML sign-in email with mocked delivery.
   Confirm Classic remains unchanged.
5. Regenerate the preview and build the app for production when preparing a
   deployment. Generated `client/dist` files are build output, not edit targets.
   Existing delivered emails retain their embedded artwork.

To find references again from the repository root:

```sh
rg -n 'ur-logo|ur-favicon|unreeled-logo|--ur-logo|UnReeled Photos' client/index.html client/src client/vite.config.ts server/src
rg -n 'ur-logo|ur-favicon' foldergram-dev
```

Also update relevant expectations in `server/test/email-auth-routes.test.ts`,
`server/test/api-cache-control.test.ts`, `server/test/folder-share-routes.test.ts`,
and client branding/title/component tests when their expected branding changes.


Personal invitation links reuse the existing `EmailSignIn.vue` UR front door at
`/signin#invite=…`; there is no additional logo asset. The optional first-sign-in
screen-name field reuses that card too. The local confirmation preview in
`foldergram-dev` / `foldergram-preview.html` includes this field with synthetic
identity data. Cinema guest account entry is a compact rounded “Sign in” button with a person icon, opening the existing combined sign-in/sign-up flow.

The local access-settings preview in `foldergram-dev` / `foldergram-preview.html`
uses synthetic identities and invitations to show the simplified invite/people
layout and Delete user confirmation. It adds no logo assets or live account actions.

Screen-name onboarding is retained behind `EMAIL_SCREEN_NAMES_ENABLED` (default
false) for a later rollout phase. The existing UR confirmation card is unchanged;
the local preview hides the name field by default and can show the retained field
when that same environment flag is set for preview generation.

The access-settings card now uses compact typography, an accessible circular-arrow
refresh control and red Delete buttons. The local settings preview reads its
actual scoped CSS. Send invitation reuses the existing branded sign-in email
(sender, subject, CTA and CID logo); the preview only simulates a send confirmation.
Already issued personal invite links continue to reuse the UR sign-in card.

While screen names are disabled, email account identity labels use the email
address once in account menus and the admin people list. Stored screen names remain
available for a later phase. Both branded sign-in email formats now describe a
24-hour, one-use link; the existing inline logo and button composition are unchanged.

Phase-one account names now use the email local part (before `@`) in the header
and account menus, without a second full-email line. Admin People rows retain the
full address beneath that user name. Static preview uses matching synthetic labels.

---
title: Security
description: The real security posture of Foldergram, including admin/viewer/public access control, mutation trust checks, and local-only caveats.
---

# Security

Foldergram is built for local-only and self-hosted browsing.
Its security model is intentionally narrow even though it now supports an
optional admin/viewer/public access gate for homelab and LAN use.

## What Foldergram assumes

- you run it on your own machine or behind a trusted local-network or reverse-proxy setup
- the app is not exposed directly to the public internet without additional protection
- the built-in auth story is a small role-based password gate, not a multi-user account system
- processes and accounts with write access to the configured gallery, thumbnail,
  and preview roots are trusted not to replace directories while Foldergram is
  performing a delete or recovery operation

## Album visibility

An album defaults to `library`, allowing regular library access. A Cinema admin
can select `link-only` in Share Folder. The server excludes link-only albums from
feed modes, search, Reels, moments, places, likes and collection previews, including
administrator discovery. Viewer album lists and normal folder/post/original and
cookie-gated derivative routes reject these albums; admins retain direct album
and management access. Story/carousel media inherits its owning album's access.

A viewer's signed-in session does not unlock a link-only album through the share
API. Its existing share-link or album-password grant is required and remains
scoped to that album. Unauthenticated access checks conceal whether an album
exists. Share media capabilities continue to follow the existing finite caching
policy: changing visibility does not erase cached or downloaded bytes.

Visibility updates require administrator capability and mutation trust checks.
Existing albums migrate to `library`; scans preserve each album's choice. The
request scope uses async-local storage, so concurrent requests do not share roles
or visibility state. Internal maintenance retains access to the complete index.

## Password protection

Foldergram can optionally protect the library from the Settings page with:

- an `admin` password for full access
- an optional separate `viewer` password for browse-only access
- an optional `public` viewer mode for anonymous browsing with local favorites

When enabled:

- Foldergram stores one-way password hashes, salts, and session metadata in SQLite `app_settings`
- the browser unlocks access with a signed `HttpOnly` session cookie
- the session payload carries the current role (`admin` or `viewer`)
- `/api` routes require that session, except for `GET /api/health`, `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/unlock-admin`, `POST /api/auth/logout`, and the scoped `/api/share/...` routes
- generated media under `/thumbnails` and `/previews` also require that session unless public viewer mode is enabled
- in `viewer_access_mode=public`, safe read routes and generated media can be browsed anonymously
- anonymous public JSON payloads omit local media paths, post source paths, and EXIF metadata, including nested carousel items
- anonymous public favorites stay in the browser and never write into SQLite likes
- authenticated API and media responses are marked `Cache-Control: no-store` and `Vary: Cookie`
- the production service worker skips caching protected thumbnail and preview responses
- admin-only routes reject `viewer` and `anonymous` sessions with `403` or `401` depending on auth state

Changing either stored password or the viewer-access mode rotates the session
version, which invalidates older sessions. Disabling password protection clears
the stored auth settings, unless the server requires authentication.

### Required authentication for public hosting

Production defaults to `AUTH_REQUIRED=true`. This requirement lives in server
configuration, independently of SQLite. A missing, empty, or partially restored
authentication database returns HTTP 503 for every application, API, media, and
share route. Unavailable database directories that fall back to transient
storage are also blocked, including when authentication is optional. Health
checks return 503 rather than reporting a healthy passwordless server. Failure
responses do not expose storage paths or administrator capabilities.

These are origin protections: signed media already cached by a browser or CDN
can remain accessible for its previously configured lifetime, as with revocation.

Restore the complete original database and restart after a storage failure.
Do not disable required authentication as a recovery workaround. The server
rejects attempts to disable password protection while `AUTH_REQUIRED=true`.

For a **new installation only**, keep the service on loopback or an otherwise
private network, explicitly set `AUTH_REQUIRED=false`, configure an admin password
through Settings, then restart with `AUTH_REQUIRED=true` before public exposure.
Development/test defaults remain optional; intentionally passwordless production
installations must explicitly choose `AUTH_REQUIRED=false`. Missing authentication
in that opt-out mode cannot be distinguished from an intentional passwordless
installation. Keep the requirement enabled on public hosts.

## Folder shares

Folder shares are narrower than viewer sessions. They grant read-only access to
one folder through `/share/:slug` and do not unlock Home, feed search, Reels,
Places, Likes, Collections, Trash, Settings, scans, rebuilds, captions, cover
editing, or delete actions. Album-scoped original downloads also require an
active grant for that album.

Admins can create:

- expiring folder links
- unlimited folder links that can still be revoked
- reusable per-folder passwords

Share links and folder passwords are independent grants rather than layers of
the same grant. Visitors with an active link do not also need the folder
password. Revoking a link invalidates that link and its session, but visitors
who know the reusable folder password can still create a password session. To
remove both access paths, revoke the applicable links and change or remove the
folder password.

For share links:

- the raw token is returned at creation and can be copied again by an admin while the link is active
- compact `/s/<signed-code>` URLs redirect to the album URL with the raw token in its fragment as `#token=...`
- SQLite stores only a SHA-256 token hash plus a short token prefix
- reusable links are derived using a separate key at `<DATA_ROOT>/secrets/share-link-recovery.key`, created with owner-only permissions; a database copy alone cannot recover them
- back up this key together with SQLite and protect it like a password; compact URLs require it on every visit. Losing or replacing it makes already-sent compact URLs unavailable, and an unreadable or corrupt key causes resolution errors. Restore the original key with its owner-only permissions to recover those URLs, or create and distribute replacement links. Previously sent full URLs containing `#token=...` still validate against their stored token hashes without this key
- Docker deployments must persist `<DATA_ROOT>/secrets` across container replacements; the supplied Compose file mounts it separately, and mounting the whole data root also preserves it
- older links remain valid but require a replacement once to enable copying
- expired and revoked links stop creating or validating share sessions

After a visitor unlocks a share, Foldergram sets a separate signed `HttpOnly`
cookie named `foldergram_share_session`. That cookie is not an admin or viewer
session. The server re-checks the underlying link or folder-password version
before granting folder access, so revoking a link, expiring a link, changing a
folder password, or removing a folder password invalidates older share grants.

Shared media does not use raw `/thumbnails/...` or `/previews/...` URLs in API
payloads. Shared folder payloads point to `/api/share/images/:id/thumbnail` and
`/api/share/images/:id/preview`, and those routes check that the request has a
grant for the image's folder before serving or lazily generating the derivative.

Unauthorized share resource requests use the same status and message whether
the album/media exists or not. The password-entry bootstrap also returns the
same locked state for unknown, link-only, and password-protected albums; its
`hasPassword` field means that password entry should be offered, not confirmation
that a guessed album has a password. Valid link and password grants retain their
existing album scope. This reduces response-based enumeration; it is not a
constant-time lookup guarantee.

## Browser response protections

Application responses deny framing with CSP `frame-ancestors 'none'` and
`X-Frame-Options: DENY`, reject MIME sniffing, and use `Referrer-Policy: no-referrer`.
The CSP also restricts base URLs and forms to the same origin and disables object
embeds. It deliberately does not restrict script/style/media sources, preserving
the existing inline startup scripts, Google Fonts, and video/blob playback; it
should not be described as a complete XSS defense.

Production sends one-year HSTS without `includeSubDomains` or preload. Browsers
honor it only on HTTPS responses. Terminate HTTPS at the proxy and preserve these
headers; the policy does not affect other subdomains. Development does not send
HSTS. Express version branding is disabled.

## Mutation protection

All mutating API routes pass through `requireTrustedMutationRequest`.

That middleware does two things:

1. Requires `x-foldergram-intent: 1`
2. Rejects non-loopback `Origin` or `Referer` values when those headers are present

Allowed hostnames are:

- `localhost`
- `127.0.0.1`
- `::1`

Allowed ports are:

- `DEV_SERVER_PORT` and the reserved `DEV_CLIENT_PORT` through `DEV_CLIENT_PORT + 3` range in development or test
- `SERVER_PORT` in production, with loopback origins or the exact host that served the app accepted for browser mutations
- explicit extra origins can be allowed through `CSRF_TRUSTED_ORIGINS`

## What this protects against

With password protection enabled, this design helps reduce opportunistic
browsing of the library from other machines on the same network.

Separately, the mutation checks help reduce accidental or cross-site
browser-triggered mutations from untrusted origins.

It is especially relevant for:

- feed and folder reads when password protection is enabled
- generated thumbnails and previews when password protection is enabled and public mode is off
- delete actions
- like toggles
- manual rescans
- rebuild operations
- Settings-only auth changes

## Path confinement

Foldergram does not serve arbitrary filesystem paths from the client.

### Original-file serving

`GET /api/originals/:id`:

- looks up the post by numeric ID
- resolves the stored absolute path
- confirms that path is still within `GALLERY_ROOT`
- confirms the file still exists

### Scan error reports

Per-run full scan error reports are written under `<DATA_ROOT>/scan-errors/`
when skip mode records supported-media failures.

- report paths are surfaced through admin-only scan details
- viewer-safe scan responses force `error_text` to `null`
- the report directory is kept separate from `/thumbnails` and `/previews`, so those files are not exposed through derivative static serving

### Delete actions

Delete flows resolve target files and directories inside configured roots before
removing them. If a stored path falls outside the expected root, the operation
throws instead of deleting blindly. Permanent deletion also rejects symbolic-link
path components, verifies file and parent-directory identities around each
filesystem mutation, and serializes its own scans, rebuilds, lazy derivative
generation, recovery, and deletion work.

This confinement guarantee covers Foldergram's own concurrent operations and
filesystem state present when an operation is validated. It is not a security
boundary against another process or account that can write to those same roots
and deliberately swap a checked directory at the exact moment of a rename or
unlink. Preventing that race requires platform-specific directory-handle-relative
filesystem operations that Foldergram does not currently use. Keep these storage
roots private to the account running Foldergram and pause other filesystem writers
during permanent deletion or recovery.

## Storage availability behavior

On startup, Foldergram checks:

- gallery directory
- thumbnails directory
- previews directory
- database directory

If the database directory is unavailable, internal services may initialize an
in-memory database, but HTTP access remains blocked with 503. An empty replacement
database is also blocked when authentication is required. If the gallery or
derivative directories are unavailable, the library is marked unavailable.

## Rate limiting

Foldergram includes small in-memory rate limiters for:

- authentication attempts
- folder share token and password unlock attempts
- admin mutation routes such as rescan and rebuild operations

These limiters are process-local and intentionally simple. They are useful for
basic abuse reduction, not for hardened distributed deployments.

The existing limiters use the directly connecting address. Behind a reverse
proxy or Docker address translation, visitors can share a login-limit bucket.
Forwarded visitor-address headers are not trusted automatically. Recovering
visitor identity requires verifying the actual deployment's ingress path;
adding an edge limit alone does not remove the application's shared limit.

## Important limitations

Foldergram does **not** currently provide:

- multi-user authentication
- per-user authorization
- TLS termination
- audit logging
- hardened remote deployment defaults
- external identity provider integration
- per-user isolation

## Practical advice

Use Foldergram like a local app:

- use strong, different admin and viewer passwords if you expose it on a homelab or LAN
- remember that public viewer mode exposes the library to anyone who can reach the app
- keep it on loopback unless you know exactly how you are proxying and protecting it
- terminate HTTPS upstream if the app is reachable off-box
- remember that on plain HTTP, both the password and session cookie are visible to anyone who can sniff that local network traffic
- do not assume the password layer and mutation checks are a full internet-facing security boundary
- treat delete actions as destructive and permanent

## A precise caveat about headers

If a mutating request omits both `Origin` and `Referer`, the middleware still
accepts it as long as `x-foldergram-intent: 1` is present. That is acceptable
for the current local-only model, but it is one reason these checks should not
be described as a full remote-hardening story.

## What Foldergram does not try to be

Foldergram is not attempting to be:

- a cloud photo product
- a multi-user NAS portal
- a public media server with account management
- a zero-trust network service

The implementation is much closer to a private local gallery with a browser UI.

## Optional email accounts

[Owner-approved email sign-in](./email-access.md) verifies approved visitors through
24-hour single-use links, with fixed 90-day server-validated sessions and
immediate account revocation. Unapproved submissions create pending requests without
sending email. Only the owner can approve or reject them; approval sends a verification
link and never creates a session directly. Deleting an account removes its sessions,
unused credentials and personal likes. The address can request access again as a
new account; old sessions and credentials never revive. Legacy blocked records
remain blocked until deleted.
Accounts have no admin permissions. Personal likes
are isolated by authenticated account identity. The existing admin password and
scoped album links remain available. Email mode must be explicitly enabled and
configured; it suppresses legacy public/viewer-password library access.

Optional owner notification emails contain 24-hour, single-use review credentials
scoped to a single pending request. Opening a link only inspects the request;
confirming approval or denial requires a CSRF-checked POST. Tokens stay in URL
fragments until the client removes them, are stored only as hashes, and confer no
admin session. Changing the owner inbox, origin or admin password invalidates them.
The intended owner must keep these links private. Denial clears the pending
request; Delete user removes an existing account and its personal likes.


## Account metrics

Account activity reports and per-person like details require administrator
capability. The server derives account identity from a validated email session;
view requests cannot choose a user or date. Both regular and scoped shared view
and like requests pass existing authentication, mutation trust and album-grant
checks. A share grant never broadens library access. Aggregate counts and the
current account's liked state are appended only to already-authorized post JSON;
no public endpoint accepts arbitrary IDs for count lookup. Personalized metadata
retains no-store and cookie-varying headers, independent of media-byte caching.

Daily uniqueness is enforced in SQLite, and login totals increment inside token
redemption. Account deletion explicitly removes activity even without FK cascades.
Public payloads never include who liked a photo or another account's metrics.
Album facts survive reindexing using an opaque folder-location key and snapshots;
only admins can see retained names. No external telemetry or browser fingerprinting
is introduced. See the email-access activity section for retention and limits.

# Changelog

## 1.2.2-slippman.1 — 2026-10-11

First release of the Slippman fork, based on upstream Foldergram 1.2.2.

- Add Cinema themes for albums and the Home feed on computers and phones,
  with larger media, capture-date ordering, adjacent-photo previews, and a
  photo-focused zoom viewer.
- Use album names, item counts, and capture-date ranges in browsing views.
- Add public camera/exposure details, admin album sharing, and native mobile
  photo sharing with a Download fallback.
- Improve desktop navigation, mobile scrolling, carousel selection, keyboard
  accessibility, dialog focus, and deletion confirmation during navigation.
- Repair capture timestamps from photo and Apple QuickTime metadata, and improve
  video previews, derivative cache validation, and Classic carousel audio.
- Hide internal paths in error responses and update vulnerable dependencies.

Known limitation: original downloads and native shares preserve embedded source
metadata, which can include GPS. GPS removal is deferred; API responses redact
coordinates and internal paths.

## Fork versioning

The upstream base remains visible in `UPSTREAM-slippman.N`. Increment `N` for
each fork release; when adopting a new upstream release, update the base and
restart the fork counter at 1. These are fork releases, not upstream releases.
Only the root package version is the app release version; workspace package
versions are internal.

Fork Git tags use `fork-vVERSION`, for example
`fork-v1.2.2-slippman.1`. Docker images built for deployment use
`slippman/foldergram:VERSION`. Pin production to the versioned image rather than
`latest`. The fork tag prefix keeps the upstream `v*.*.*` GHCR workflow separate
from the local production build/deploy workflow.

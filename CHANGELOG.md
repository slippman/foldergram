# Changelog

## 1.2.2-slippman.1.7.0 — 2026-10-16

### New features

- Album share links use compact URLs with the same preview cards, expiration, and revocation controls.

### Bug fixes

- Album URL names omit apostrophes instead of replacing them with extra dashes.
- Cinema share copy buttons confirm successful copies with a checkmark and a temporary Copied label.

## 1.2.2-slippman.1.6.2 — 2026-10-16

### Bug fixes

- Fullscreen videos pause immediately when you navigate away. Returning to a video resumes its position during the current browsing session; finished videos restart without flashing the ending frame.
- Cinema fullscreen navigation clears the previous media immediately and shows its loader only after a configurable delay, defaulting to one second.
- Reloading a direct Cinema post link preserves fullscreen mode, starts with details closed, and keeps UR loading branding while the app starts.
- Cinema navigation arrows have a glass finish and stay clear of the desktop action icons.

## 1.2.2-slippman.1.6.1 — 2026-10-15

### Bug fixes

- Cinema browser tabs now show the current album name followed by “| UnReeled Photos” and update as you navigate.
- Replaced the Cinema favicon with a clearer UR monogram and transparent rounded corners.
- Cinema hides Rediscover when no posts are at least 180 days old and falls back to Recent when needed.

## 1.2.2-slippman.1.6.0 — 2026-10-14

### New features
- Configure one browser and CDN media-cache lifetime for regular and shared album views. Enable it with MEDIA_CACHE_ENABLED and set the duration with MEDIA_CACHE_TTL_SECONDS. Album data and admin responses remain uncached.
- Cinema uses a UR browser-tab icon and shows the album-style logo and Foldergram footer at the end of the Home feed.

### Bug fixes
- Direct Cinema album links show the UnReeled loading screen from the start.
- Cinema videos keep their thumbnail visible until playback starts, show a buffering indicator on slow connections, and offer Retry when loading fails.

## 1.2.2-slippman.1.5.0 — 2026-10-14

### New features

- Cinema shares and downloads full-resolution originals from both regular albums and shared links. Video sharing accepts files up to 250 MB; larger files offer Download or Cancel. Shared originals require active access to that album.
- Cinema video sharing shows preparation progress, then a ready-to-share button in the same popup. Only one video can prepare or share at a time; another attempt offers a button to return to the active share.
- Admins can see the original filename in Cinema photo and video details.

### Bug fixes

- Shared movies keep their original filenames and recognizable video extensions, including .mov, instead of being sent as files such as media.quicktime.
- Cinema video preparation can be canceled and stops when stalled or when leaving the view. Unsupported sharing offers an explicit download instead of automatically navigating away from the album.
- The Cinema album share dialog uses a rectangular Copy button that matches the Revoke control.

## 1.2.2-slippman.1.4.0 — 2026-10-14

### New features

- Cinema fullscreen viewers keep photo actions in a right-side rail. Admin tools for editing captions, setting album covers, and deleting posts are grouped under More. Desktop sharing sends or copies the current photo link.

### Bug fixes

- Cinema uses one continuous UR loading screen while fetching a post and loading its photo, including shared albums. Opening a photo waits for that viewer instead of relying on the album behind it.
- Cinema scroll views keep icons, captions, and capture dates on separate rows. Left-aligned details and a close divider make it clearer which photo they belong to, with space before the next post.

## 1.2.2-slippman.1.3.0 — 2026-10-14

### New features

- Cinema shared and standard albums use the same compact header, with a persistent grid-browsing hint and UnReeled Photos branding. The footer links to UnReeled and this fork's source.
- Cinema album loading screens use a dark-mode-aware UR logo and wait for images in the loaded page before showing the grid or scrolling view. Slow or failed loading offers Retry.
- In Cinema, share videos through the same native mobile sharing action as photos, with matching sharing and download icons.

### Bug fixes

- Long Cinema album titles no longer push the site name off narrow mobile screens.
- Cinema no longer shows “You are caught up” at the end of an album or Home feed.
- Stalled read requests now report a timeout instead of leaving album loading pending indefinitely.

## 1.2.2-slippman.1.2.0 — 2026-10-12

### New features

- Copy an existing active album share link from the admin share menu without replacing it or changing its expiry. Links created before this update still work, but need a one-time replacement to enable copying.

### Bug fixes

- Album-cover link previews now serve a JPEG image with explicit image-type metadata to improve compatibility with messaging apps.
- Cinema photos show “Loading image…” while downloading and an error message if loading fails after retries.
- Longer fork version numbers no longer overlap the sidebar logo.

## 1.2.2-slippman.1.1.0 — 2026-10-11

### New features

- New album share links provide the album cover and name for compatible messaging apps when the site is publicly reachable. Preview access is limited to the cover and title and expires or stops working when the link is revoked.

### Bug fixes

- Shared album links now follow the album’s Cinema theme, with the same photo grid, scrolling hints, video controls, image-focused zoom, camera Info, and mobile sharing as regular albums. Favorites in shared albums stay in the visitor’s browser.

## 1.2.2-slippman.1 — 2026-10-11

### New features

- Cinema gives photos and videos more room on computers and phones. Choose it
  separately for albums and the Home feed. Album grids open into a scrolling
  view, with a glimpse of nearby photos to help you find your way.
- Click a photo to open a screen-filling viewer. Camera and exposure details are
  available from Info without taking space away from the photo.
- Browse albums using item counts and the dates the photos were taken, including
  date ranges for albums spanning several days. Album date is the default sort.
- Share albums from the admin menu. On supported phones, share a photo through
  the phone's share sheet; Download remains available when sharing isn't supported.
- Expand desktop navigation with a click. It moves content aside and closes when
  you click outside it.

### Bug fixes

- Photos and Apple Photos video exports use their original capture dates when
  available, rather than export dates. Missing capture dates no longer appear as
  if they were genuine camera timestamps.
- Fixed failed video previews and reuse of empty cached previews. Videos shown
  only as a small scrolling preview stay paused, and Classic carousels respect
  the mute setting.
- Reduced jumping during iPhone scrolling as Safari's toolbar changes size.
  Long photo details can now be scrolled on mobile.
- Zooming a carousel opens the selected photo instead of returning to its first
  slide. Home carousel photos can also be opened using the keyboard.
- Escape closes the caption editor or deletion dialog before closing the photo
  viewer, and keyboard focus returns to the button that opened the dialog.
- Confirming deletion targets the photo that opened the dialog, even if another
  photo finishes loading before you confirm. This applies to both Trash and
  permanent deletion.
- A failed attempt to share a photo on mobile now offers a working Download
  button instead of suggesting an unavailable action.
- Error messages no longer expose private file locations. Fixed known security
  issues in the libraries used to serve and process media.

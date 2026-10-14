# Changelog

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

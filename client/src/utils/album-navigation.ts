import type { NavigationFailure, RouteLocationNormalized } from 'vue-router';

export function notifyAlbumLoading(to: RouteLocationNormalized, from: RouteLocationNormalized, failure?: NavigationFailure | void, modalBackgroundPath?: string | null) {
  if (failure) return;
  if ((from.name === 'image' || from.name === 'shared-post') && to.fullPath === modalBackgroundPath) return;
  if (to.name !== 'folder' && to.name !== 'shared-folder') {
    if (['folder', 'shared-folder', 'shared-post', 'image'].includes(String(from.name))
      && to.name !== 'image' && to.name !== 'shared-post') {
      window.dispatchEvent(new Event('foldergram:album-view-cancel'));
    }
    return;
  }
  if (to.name !== from.name || to.params.slug !== from.params.slug || to.query.view !== from.query.view || to.query.tab !== from.query.tab) {
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
  }
}

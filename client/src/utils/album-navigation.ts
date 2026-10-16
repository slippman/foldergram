import type { NavigationFailure, RouteLocationNormalized } from 'vue-router';

const imageRoutes = ['image', 'shared-post', 'shared-image'];

export function notifyAlbumLoading(to: RouteLocationNormalized, from: RouteLocationNormalized, failure?: NavigationFailure | void, modalBackgroundPath?: string | null, cinema: boolean | null = true) {
  if (failure) return;
  if (cinema !== true) {
    if (from.name) window.dispatchEvent(new Event('foldergram:album-view-cancel'));
    return;
  }
  if (imageRoutes.includes(String(from.name)) && to.fullPath === modalBackgroundPath) return;
  if (to.name === 'shared-post' || to.name === 'shared-image') {
    if (!modalBackgroundPath && to.fullPath !== from.fullPath) {
      window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
    }
    return;
  }
  if (to.name !== 'folder' && to.name !== 'shared-folder') {
    if (['folder', 'shared-folder', ...imageRoutes].includes(String(from.name))
      && !imageRoutes.includes(String(to.name))) {
      window.dispatchEvent(new Event('foldergram:album-view-cancel'));
    }
    return;
  }
  if (to.name !== from.name || to.params.slug !== from.params.slug || to.query.view !== from.query.view || to.query.tab !== from.query.tab) {
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
  }
}

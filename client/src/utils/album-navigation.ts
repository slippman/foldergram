import type { NavigationFailure, RouteLocationNormalized } from 'vue-router';

export function notifyAlbumLoading(to: RouteLocationNormalized, from: RouteLocationNormalized, failure?: NavigationFailure | void) {
  if (failure || (to.name !== 'folder' && to.name !== 'shared-folder')) return;
  if (to.name !== from.name || to.params.slug !== from.params.slug || to.query.view !== from.query.view) {
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
  }
}

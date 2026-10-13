import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it, vi } from 'vitest';
import { notifyAlbumLoading } from './album-navigation';

describe('album navigation loading', () => {
  it('signals entry, album changes and view changes, excluding duplicate and failed navigation', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/f/:slug', alias: '/folders/:slug', name: 'folder', component: {} },
      { path: '/share/:slug', name: 'shared-folder', component: {} }
    ] });
    router.afterEach(notifyAlbumLoading);
    router.beforeEach(to => to.params.slug !== 'blocked');
    const loading = vi.fn();
    const cancelled = vi.fn();
    window.addEventListener('foldergram:album-view-loading', loading);
    window.addEventListener('foldergram:album-view-cancel', cancelled);
    try {
      await router.push('/');
      expect(loading).not.toHaveBeenCalled();
      for (const path of ['/f/first', '/f/second', '/f/second?view=scroll', '/share/public', '/folders/alias', '/folders/alias?tab=reels', '/folders/alias?tab=posts']) {
        loading.mockClear();
        await router.push(path);
        expect(loading).toHaveBeenCalledOnce();
      }
      loading.mockClear();
      await router.push('/folders/alias?tab=posts');
      await router.push('/f/blocked');
      await router.push('/folders/alias?tab=posts&photo=1');
      await router.push('/');
      expect(loading).not.toHaveBeenCalled();
      expect(cancelled).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('foldergram:album-view-loading', loading);
      window.removeEventListener('foldergram:album-view-cancel', cancelled);
    }
  });
  it.each(['image', 'shared-post', 'shared-image'])('preserves the loaded album when closing a %s modal', async (name) => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/f/:slug', name: 'folder', component: {} },
      { path: '/modal/:id', name, component: {} }
    ] });
    let background: string | null = null;
    router.afterEach((to, from, failure) => notifyAlbumLoading(to, from, failure, background));
    await router.push('/f/trip?view=scroll');
    const loading = vi.fn();
    window.addEventListener('foldergram:album-view-loading', loading);
    try {
      background = router.currentRoute.value.fullPath;
      await router.push('/modal/1');
      await router.push(background);
      expect(loading).not.toHaveBeenCalled();
      background = null;
      await router.push('/modal/1');
      await router.push('/f/trip?view=scroll');
      expect(loading).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('foldergram:album-view-loading', loading); }
  });
  it('cancels loading when leaving the shared image alias', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/share/:slug/images/:id', name: 'shared-image', component: {} }
    ] });
    router.afterEach(notifyAlbumLoading);
    await router.push('/share/trip/images/1');
    const cancelled = vi.fn();
    window.addEventListener('foldergram:album-view-cancel', cancelled);
    try {
      await router.push('/');
      expect(cancelled).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('foldergram:album-view-cancel', cancelled); }
  });
});

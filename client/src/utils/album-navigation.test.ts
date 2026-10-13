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
    window.addEventListener('foldergram:album-view-loading', loading);
    try {
      await router.push('/');
      expect(loading).not.toHaveBeenCalled();
      for (const path of ['/f/first', '/f/second', '/f/second?view=scroll', '/share/public', '/folders/alias']) {
        loading.mockClear();
        await router.push(path);
        expect(loading).toHaveBeenCalledOnce();
      }
      loading.mockClear();
      await router.push('/folders/alias');
      await router.push('/f/blocked');
      await router.push('/folders/alias?photo=1');
      await router.push('/');
      expect(loading).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('foldergram:album-view-loading', loading);
    }
  });
});

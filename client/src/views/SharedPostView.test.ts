import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import SharedPostView from './SharedPostView.vue';
import { useShareStore } from '../stores/share';
import * as galleryApi from '../api/gallery';
import type { SharedImageDetail } from '../types/api';

vi.mock('vidstack/bundle', () => ({}));
vi.mock('vue-router', async () => ({
  ...await vi.importActual<typeof import('vue-router')>('vue-router'),
  useRoute: () => ({ name: 'shared-post', query: {} }),
  useRouter: () => ({ replace: vi.fn() })
}));

describe('shared post readiness', () => {
  it.each(['classic', 'cinema'] as const)('does not expose the previous %s post while the requested post loads', async (displayTheme) => {
    setActivePinia(createPinia());
    const image = (id: number): SharedImageDetail => ({
      id, folderId: 1, folderSlug: 'trip', folderName: 'Trip', filename: 'photo.jpg',
      caption: null, mediaType: 'image', mimeType: 'image/jpeg', width: 640, height: 480,
      durationMs: null, thumbnailUrl: '/thumb.jpg', previewUrl: '/preview.jpg',
      sortTimestamp: 0, previousImageId: null, nextImageId: null, displayTheme
    });
    const store = useShareStore();
    store.image = image(1);
    let resolve!: (image: SharedImageDetail) => void;
    const fetch = vi.spyOn(galleryApi, 'fetchSharedPost').mockImplementation(() => new Promise(done => { resolve = done; }));
    const wrapper = mount(SharedPostView, {
      props: { slug: 'trip', id: '2' },
      global: { stubs: { PostViewer: true, RouterLink: true, ResilientImage: true } }
    });
    try {
      expect(wrapper.attributes('data-album-state')).toBe('loading');
      resolve(image(2));
      await flushPromises();
      expect(wrapper.attributes('data-album-state')).toBe('ready');
      await wrapper.setProps({ id: '3' });
      expect(store.image?.id).toBe(2);
      expect(wrapper.attributes('data-album-state')).toBe('loading');
      if (displayTheme === 'cinema') expect(wrapper.findComponent({ name: 'PostViewer' }).props('loading')).toBe(true);
      resolve(image(3));
      await flushPromises();
      expect(wrapper.attributes('data-album-state')).toBe('ready');
      expect(store.image?.id).toBe(3);
      if (displayTheme === 'cinema') expect(wrapper.findComponent({ name: 'PostViewer' }).props('loading')).toBe(false);
    } finally { wrapper.unmount(); fetch.mockRestore(); }
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FolderView from './FolderView.vue';
import { useAppStore } from '../stores/app';
import { useFoldersStore } from '../stores/folders';
import { useFolderStoriesStore } from '../stores/folder-stories';
import type { FeedItem } from '../types/api';

const items: FeedItem[] = [1, 2].map(id => ({
  id, folderId: 1, folderSlug: 'trip', folderName: 'Trip', folderPath: 'Trip',
  folderBreadcrumb: null, filename: `${id}.jpeg`, caption: null, width: id === 1 ? 1600 : 900,
  height: id === 1 ? 900 : 1600, mediaType: 'image', durationMs: null,
  thumbnailUrl: `/thumb-${id}.jpg`, previewUrl: `/preview-${id}.jpg`, takenAt: id * 1000, sortTimestamp: id * 1000
}));
async function render(theme: 'cinema' | 'classic' = 'cinema') {
  vi.spyOn(useAppStore(), 'folderDisplayTheme', 'get').mockReturnValue(theme);
  const folders = useFoldersStore();
  folders.currentFolder = {
    id: 1, slug: 'trip', name: 'Trip', description: null, folderPath: 'Trip', breadcrumb: null,
    imageCount: 2, videoCount: 0, latestImageMtimeMs: null, avatarImageId: null, avatarUrl: null
  };
  folders.currentImages = [...items]; folders.currentHasMore = false;
  vi.spyOn(folders, 'loadFolder').mockResolvedValue();
  vi.spyOn(useFolderStoriesStore(), 'fetchStories').mockResolvedValue();
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/f/:slug', name: 'folder', component: FolderView, props: true },
    { path: '/library', name: 'library', component: { template: '<div />' } },
    { path: '/p/:id', name: 'image', component: { template: '<div />' } }
  ] });
  await router.push('/f/trip'); await router.isReady();
  const wrapper = mount(FolderView, { props: { slug: 'trip' }, global: {
    plugins: [router], stubs: {
      InfiniteLoader: true, FolderHeader: true, EmptyState: true, StoriesModal: true,
      CinemaPost: { props: ['item'], template: '<article class="cinema-post" />' },
      ResilientImage: { props: ['src', 'alt'], template: '<img :src="src" :alt="alt" />' }
    }
  } });
  await flushPromises(); return { wrapper, router, folders };
}
describe('Cinema album navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    Element.prototype.scrollIntoView = vi.fn();
  });
  it('lands on the grid, opens the clicked photo in scroll, and returns to the grid', async () => {
    const { wrapper, router } = await render();
    expect(wrapper.findAll('.cinema-grid__tile')).toHaveLength(2);
    expect(wrapper.find('.cinema-post').exists()).toBe(false);
    await wrapper.findAll('.cinema-grid__tile')[1].trigger('click'); await flushPromises();
    expect(router.currentRoute.value.query).toMatchObject({ view: 'scroll', photo: '2' });
    expect(wrapper.findAll('.cinema-post')).toHaveLength(2);
    await wrapper.get('.folder-cinema__back').trigger('click'); await flushPromises();
    expect(wrapper.find('.cinema-grid').exists()).toBe(true);
    expect(router.currentRoute.value.query.view).toBeUndefined(); wrapper.unmount();
  });
  it('loads through a bookmarked photo on a later page', async () => {
    const { wrapper, router, folders } = await render();
    folders.currentImages = [items[0]]; folders.currentHasMore = true;
    vi.mocked(folders.loadFolder).mockImplementation(async () => {
      folders.currentImages.push(items[1]); folders.currentPage++; folders.currentHasMore = false;
    });
    await router.push('/f/trip?view=scroll&photo=2'); await flushPromises();
    expect(folders.loadFolder).toHaveBeenLastCalledWith('trip', false, undefined);
    expect(wrapper.find('#cinema-post-2').exists()).toBe(true); wrapper.unmount();
  });
  it('opens Cinema grid and scroll on phone widths', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { wrapper } = await render();
    expect(wrapper.findAll('.cinema-grid__tile')).toHaveLength(2);
    await wrapper.findAll('.cinema-grid__tile')[0].trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.cinema-post')).toHaveLength(2);
    wrapper.unmount();
  });
  it('keeps Classic using the existing grid', async () => {
    const { wrapper } = await render('classic');
    expect(wrapper.find('.cinema-grid').exists()).toBe(false);
    expect(wrapper.find('.grid-cols-3').exists()).toBe(true); wrapper.unmount();
  });
});

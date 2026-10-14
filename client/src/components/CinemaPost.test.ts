import { defineComponent, h, nextTick } from 'vue';
import { provideCinemaAudio } from '../composables/useCinemaAudio';
import { useAppStore } from '../stores/app';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CinemaPost from './CinemaPost.vue';
import { useAuthStore } from '../stores/auth';
import * as galleryApi from '../api/gallery';
import type { FeedItem } from '../types/api';

vi.mock('vidstack/bundle', () => ({}));
const navigatePhoto = vi.fn();
const mockRoute = vi.hoisted(() => ({ name: 'folder', fullPath: '/folder/trip?view=scroll&photo=1' }));
vi.mock('vue-router', () => ({ useRoute: () => mockRoute, useRouter: () => ({ push: vi.fn() }) }));
const item: FeedItem = {
  id: 1, folderId: 1, folderSlug: 'trip', folderName: 'Trip', folderPath: 'Trip',
  folderBreadcrumb: null, filename: 'PXL_20261001.jpg', caption: null,
  width: 1600, height: 900, mediaType: 'image', durationMs: null,
  thumbnailUrl: '/thumb.jpg', previewUrl: '/preview.jpg',
  sortTimestamp: 1700000000000, takenAt: null
};
function render(overrides: Partial<FeedItem> = {}) {
  return mount(CinemaPost, {
    props: { item: { ...item, ...overrides } },
    global: { stubs: { VideoMediaPlayer: true, CarouselMediaStage: true, RouterLink: defineComponent({ name: 'RouterLink', props: { custom: Boolean, to: Object }, setup: (props, { slots }) => () => props.custom ? slots.default?.({ href: '/post/1', navigate: navigatePhoto }) : h('a', slots.default?.()) }) } }
  });
}

describe('CinemaPost', () => {
  beforeEach(() => { setActivePinia(createPinia()); mockRoute.name = 'folder'; });
  it('uses the shared Info API and preview download even in an admin session', async () => {
    const normalFetch = vi.spyOn(galleryApi, 'fetchImage');
    const sharedFetch = vi.spyOn(galleryApi, 'fetchSharedPost').mockResolvedValue({
      ...item, mimeType: 'image/jpeg', fileSize: 1048576, displayTheme: 'cinema',
      exif: { cameraMake: 'Apple', cameraModel: 'iPhone' }, nextImageId: null, previousImageId: null
    });
    const wrapper = render();
    await wrapper.setProps({ sharedSlug: 'trip' });
    expect(wrapper.find('button[aria-label="Edit caption"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-pressed]').exists()).toBe(true);
    expect(wrapper.find('button[aria-pressed]').attributes('aria-label')).toBe('Favorite post');
    expect(wrapper.get('a[download]').attributes('href')).toBe('/preview.jpg');
    await wrapper.get('button[aria-controls]').trigger('click');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(sharedFetch).toHaveBeenCalledWith(1);
    expect(normalFetch).not.toHaveBeenCalled();
    expect(wrapper.get('.cinema-post__info').text()).toContain('Apple iPhone');
    const photo = wrapper.findAllComponents({ name: 'RouterLink' })[0];
    expect(photo.props('to')).toMatchObject({ name: 'shared-post', params: { slug: 'trip', id: '1' } });
    normalFetch.mockRestore();
    sharedFetch.mockRestore();
  });

  it('does not show filenames or indexing dates as captions or capture dates', () => {
    const wrapper = render();
    expect(wrapper.text()).not.toContain('PXL');
    expect(wrapper.find('.cinema-post__caption').exists()).toBe(false);
    expect(wrapper.find('time').exists()).toBe(false);
    expect(wrapper.get('img').attributes('src')).toBe('/preview.jpg');
  });
  it.each(['mtime', 'first_seen', 'sort_timestamp', null, undefined] as const)(
    'does not display a fallback timestamp with source %s', (takenAtSource) => {
      const wrapper = render({ takenAt: 1700000000000, takenAtSource });
      expect(wrapper.find('time').exists()).toBe(false);
    }
  );
  it('shows an entered caption, capture time, and known location', () => {
    const wrapper = render({ caption: 'Family evening', takenAt: 1700000000000, takenAtSource: 'exif',
      place: { id: 2, slug: 'denver', name: 'Denver', kind: 'city', isApproximate: false } });
    expect(wrapper.get('.cinema-post__caption').text()).toBe('Family evening');
    expect(wrapper.get('time').attributes('datetime')).toBe('2023-11-14T22:13:20.000Z');
    expect(wrapper.text()).toContain('Denver');
    expect(wrapper.text()).not.toContain('1600');
  });
  it('opens photos over the current album while leaving video clicks alone', async () => {
    navigatePhoto.mockClear();
    const wrapper = render();
    await wrapper.get('.cinema-post__photo').trigger('click');
    expect(useAppStore().imageModalBackgroundPath).toBe('/folder/trip?view=scroll&photo=1');
    expect(navigatePhoto).toHaveBeenCalledOnce();
    wrapper.unmount();
    const video = render({ mediaType: 'video' });
    expect(video.find('.cinema-post__photo').exists()).toBe(false);
    video.unmount();
  });
  it('includes the selected carousel photo in the zoom route', async () => {
    mockRoute.name = 'home';
    const wrapper = render({ postType: 'carousel', mediaItems: [
      { imageId: 10, position: 1, mediaType: 'image', width: 100, height: 100 },
      { imageId: 11, position: 2, mediaType: 'image', width: 100, height: 100 }
    ] as FeedItem['mediaItems'] });
    wrapper.findComponent({ name: 'CarouselMediaStage' }).vm.$emit('update:modelValue', 1);
    await nextTick();
    const route = wrapper.findAllComponents({ name: 'RouterLink' }).find(link => link.props('custom'));
    expect(route?.props('to').query).toEqual({ media: '11' });
    expect(wrapper.get('.cinema-post__zoom--carousel').attributes('href')).toBe('/post/1');
  });

  it('renders initially muted video controls without looping', () => {
    const wrapper = render({ mediaType: 'video' });
    const player = wrapper.findComponent({ name: 'VideoMediaPlayer' });
    expect(player.exists()).toBe(true);
    expect(player.props('muted')).toBe(true);
    expect(player.props('loop')).toBe(false);
  });
  it('loads extra details only when Info is opened and provides an original download link', async () => {
    const fetch = vi.spyOn(galleryApi, 'fetchImage').mockResolvedValue({ ...item,
      folderAvatarImageId: null, relativePath: 'Trip/PXL_20261001.jpg', mimeType: 'image/jpeg',
      fileSize: 1048576, exif: { cameraMake: 'Apple', cameraModel: 'iPhone 16 Pro', iso: 800 }, originalUrl: '/original', nextImageId: null, previousImageId: null });
    const wrapper = render();
    expect(fetch).not.toHaveBeenCalled();
    const info = wrapper.get('button[aria-controls]');
    expect(info.attributes('aria-expanded')).toBe('false');
    await info.trigger('click');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledWith(1);
    expect(wrapper.get('.cinema-post__info').text()).toContain('image/jpeg');
    expect(wrapper.get('.cinema-post__info').text()).toContain('1 MB');
    expect(wrapper.get('.cinema-post__info').text()).toContain('Apple iPhone 16 Pro');
    expect(wrapper.get('.cinema-post__info').text()).toContain('800');
    expect(wrapper.get('.cinema-post__info').text()).not.toContain(item.filename);
    expect(wrapper.get('a[download]').attributes('href')).toContain('download');
    await info.trigger('click');
    expect(wrapper.find('.cinema-post__info').exists()).toBe(false);
    fetch.mockRestore();
  });

  it('preserves carousel membership in a single scroll post', () => {
    const media = { imageId: 1, position: 1, filename: item.filename, mediaType: 'image' as const,
      width: 1600, height: 900, durationMs: null, isAnimated: false, thumbnailUrl: '/thumb.jpg', previewUrl: '/preview.jpg' };
    const wrapper = render({ postType: 'carousel', mediaItems: [media, { ...media, imageId: 2, position: 2 }] });
    expect(wrapper.findComponent({ name: 'CarouselMediaStage' }).props('items')).toHaveLength(2);
  });
  it('opens a blank caption editor for admins and hides editing for viewers', async () => {
    const wrapper = render();
    await wrapper.get('button[aria-label="Edit caption"]').trigger('click');
    expect(wrapper.get('textarea').element.value).toBe('');
    wrapper.unmount();
    useAuthStore().capabilities.canManageLibrary = false;
    expect(render().find('button[aria-label="Edit caption"]').exists()).toBe(false);
  });
});


describe('Cinema audio coordination', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('transfers sound between single videos and carousels without changing feed sound', async () => {
    const media = { imageId: 2, position: 1, filename: 'clip.mp4', mediaType: 'video' as const,
      width: 1600, height: 900, durationMs: 10000, isAnimated: false,
      thumbnailUrl: '/thumb.jpg', previewUrl: '/clip.mp4' };
    const wrapper = mount(defineComponent({
      setup() {
        provideCinemaAudio();
        return () => h('div', [
          h(CinemaPost, { item: { ...item, mediaType: 'video' } }),
          h(CinemaPost, { item: { ...item, id: 2, postType: 'carousel',
            mediaItems: [media, { ...media, imageId: 3, position: 2 }] } })
        ]);
      }
    }), { global: { stubs: { VideoMediaPlayer: true, RouterLink: true } } });
    const players = wrapper.findAllComponents({ name: 'VideoMediaPlayer' });
    const feedMuted = useAppStore().videoMuted;
    expect(players.map(player => player.props('muted'))).toEqual([true, true]);
    players[0].vm.$emit('toggle-mute');
    await nextTick();
    expect(players.map(player => player.props('muted'))).toEqual([false, true]);
    players[1].vm.$emit('toggle-mute');
    await nextTick();
    expect(players.map(player => player.props('muted'))).toEqual([true, false]);
    players[1].vm.$emit('autoplay-muted');
    await nextTick();
    expect(players.map(player => player.props('muted'))).toEqual([true, true]);
    expect(useAppStore().videoMuted).toBe(feedMuted);
    wrapper.unmount();
  });
  it('only autoplays videos when at least half the media is visible', async () => {
    let visibility!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { visibility = callback; }
      observe() {}
      disconnect() {}
    });
    try {
      const wrapper = render({ mediaType: 'video' });
      const player = wrapper.findComponent({ name: 'VideoMediaPlayer' });
      visibility([{ isIntersecting: true, intersectionRatio: 0.1 } as IntersectionObserverEntry], {} as IntersectionObserver);
      await nextTick();
      expect(player.props('autoplay')).toBe(false);
      visibility([{ isIntersecting: true, intersectionRatio: 0.8 } as IntersectionObserverEntry], {} as IntersectionObserver);
      await nextTick();
      expect(player.props('autoplay')).toBe(true);
      player.vm.$emit('toggle-mute');
      await nextTick();
      visibility([{ isIntersecting: true, intersectionRatio: 0.1 } as IntersectionObserverEntry], {} as IntersectionObserver);
      await nextTick();
      expect(player.props('autoplay')).toBe(false);
      expect(player.props('muted')).toBe(true);
      wrapper.unmount();
    } finally { vi.unstubAllGlobals(); }
  });
  it('releases sound when the audible post leaves the viewport', async () => {
    let visibility!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { visibility = callback; }
      observe() {}
      disconnect() {}
    });
    try {
      const wrapper = render({ mediaType: 'video' });
      const player = wrapper.findComponent({ name: 'VideoMediaPlayer' });
      player.vm.$emit('toggle-mute');
      await nextTick();
      expect(player.props('muted')).toBe(false);
      visibility([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
      await nextTick();
      expect(player.props('muted')).toBe(true);
      wrapper.unmount();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('starts visible video muted after the album becomes ready', async () => {
    let visibility!: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { visibility = callback; }
      observe() {}
      disconnect() {}
    });
    const splash = document.createElement('div');
    splash.id = 'fg-splash';
    document.body.append(splash);
    const wrapper = render({ mediaType: 'video' });
    try {
      const media = document.createElement('media-player') as HTMLElement & { muted: boolean; play: ReturnType<typeof vi.fn> };
      media.muted = false;
      media.play = vi.fn().mockImplementation(() => {
        expect(media.muted).toBe(true);
        return Promise.resolve();
      });
      wrapper.element.append(media);
      visibility([{ isIntersecting: true, intersectionRatio: 0.8 } as IntersectionObserverEntry], {} as IntersectionObserver);
      await nextTick();
      expect(media.play).not.toHaveBeenCalled();
      splash.remove();
      window.dispatchEvent(new Event('foldergram:album-ready'));
      await nextTick();
      await nextTick();
      expect(media.play).toHaveBeenCalledOnce();
    } finally {
      wrapper.unmount();
      splash.remove();
      vi.unstubAllGlobals();
    }
  });
});

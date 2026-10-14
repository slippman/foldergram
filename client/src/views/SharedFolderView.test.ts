import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SharedFolderView from './SharedFolderView.vue';

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');
  return {
    ...actual,
    useRouter: () => ({ resolve: () => ({ name: 'shared-folder', params: { slug: 'travel-2024' }, query: {} }) }),
    useRoute: () => ({
      fullPath: '/share/travel-2024',
      hash: '',
      query: {}
    })
  };
});

describe('SharedFolderView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it('preserves the original Classic shared album layout', async () => {
    const { useShareStore } = await import('../stores/share');
    const store = useShareStore();
    vi.spyOn(store, 'loadAccess').mockImplementation(async () => {
      store.access = { exists: true, granted: true, hasPassword: false, publicAccess: false };
      return store.access;
    });
    vi.spyOn(store, 'loadFolder').mockImplementation(async () => {
      store.folder = { id: 1, slug: 'travel-2024', name: 'Travel', description: null,
        imageCount: 1, postCount: 1, videoCount: 0, avatarThumbnailUrl: null,
        sortTimestamp: 0, displayTheme: 'classic' };
      store.images = [{ id: 1, folderId: 1, folderSlug: 'travel-2024', folderName: 'Travel',
        filename: 'photo.jpg', caption: null, mediaType: 'image', width: 640, height: 480,
        durationMs: null, thumbnailUrl: '/thumb.jpg', previewUrl: '/preview.jpg', sortTimestamp: 0 }];
    });
    const wrapper = mount(SharedFolderView, {
      props: { slug: 'travel-2024' },
      global: { stubs: { Avatar: true, FolderGrid: true, InfiniteLoader: true, RouterLink: { template: '<a><slot /></a>' } } }
    });
    await flushPromises();
    expect(wrapper.find('.album-header').exists()).toBe(false);
    expect(wrapper.find('.album-attribution').exists()).toBe(false);
    expect(wrapper.get('header').text()).toBe('Foldergram');
    expect(wrapper.get('main').classes()).toContain('px-5');
    expect(wrapper.findComponent({ name: 'Avatar' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'InfiniteLoader' }).props('showComplete')).toBe(true);
    wrapper.unmount();
  });

  it('uses the shared album theme without loading global settings', async () => {
    const { useShareStore } = await import('../stores/share');
    const store = useShareStore();
    vi.spyOn(store, 'loadAccess').mockImplementation(async () => {
      store.access = { exists: true, granted: true, hasPassword: false, publicAccess: false };
      return store.access;
    });
    vi.spyOn(store, 'loadFolder').mockImplementation(async () => {
      store.folder = { id: 1, slug: 'travel-2024', name: 'Travel', description: null,
        imageCount: 1, postCount: 1, videoCount: 0, avatarThumbnailUrl: null,
        sortTimestamp: 0, displayTheme: 'cinema' };
      store.loading = true;
    });
    const wrapper = mount(SharedFolderView, {
      props: { slug: 'travel-2024' },
      global: { stubs: { Avatar: true, FolderGrid: true, InfiniteLoader: true, RouterLink: true } }
    });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'FolderGrid' }).props('variant')).toBe('cinema');
    expect(wrapper.findComponent({ name: 'FolderGrid' }).props('sharedSlug')).toBe('travel-2024');
    expect(wrapper.findComponent({ name: 'InfiniteLoader' }).props('showComplete')).toBe(false);
    expect(wrapper.find('.album-header').exists()).toBe(true);
    expect(wrapper.text()).toContain('UnReeled Photos');
    expect(wrapper.find('.shared-album-brand__logo').exists()).toBe(false);
  });

  it('keeps one loading display while access succeeds and the album is still pending', async () => {
    const { useShareStore } = await import('../stores/share');
    const store = useShareStore();
    window.history.replaceState(null, '', '/share/travel-2024#token=test-token');
    const access = vi.spyOn(store, 'loadAccess').mockImplementation(async () => {
      store.access = { exists: true, granted: true, hasPassword: false, publicAccess: false };
      return store.access;
    });
    vi.spyOn(store, 'unlockLink').mockImplementation(async () => { await store.loadAccess('travel-2024'); });
    let finish!: () => void;
    vi.spyOn(store, 'loadFolder').mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const wrapper = mount(SharedFolderView, {
      props: { slug: 'travel-2024' },
      global: { stubs: { ErrorState: { template: '<div class="error-state" />' }, RouterLink: true } }
    });
    const loading = wrapper.get('main > section > section').element;
    await flushPromises();
    expect(access).toHaveBeenCalledTimes(1);
    expect(wrapper.get('main > section > section').element).toBe(loading);
    expect(wrapper.find('.shared-album-loading__logo').exists()).toBe(false);
    expect(wrapper.get('main').attributes('data-album-theme')).toBe('unknown');
    expect(wrapper.find('.error-state').exists()).toBe(false);
    store.error = 'Album unavailable';
    finish();
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('.error-state').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders password prompt when access is not yet granted and folder requires password', async () => {
    const { useShareStore } = await import('../stores/share');
    const shareStore = useShareStore();
    shareStore.access = {
      exists: true,
      granted: false,
      hasPassword: true,
      publicAccess: false
    };

    const wrapper = mount(SharedFolderView, {
      props: {
        slug: 'travel-2024'
      },
      global: {
        stubs: {
          Avatar: true,
          EmptyState: true,
          ErrorState: true,
          FolderGrid: true,
          InfiniteLoader: true,
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    });

    expect(wrapper.text()).toContain('Folder Share');
    expect(wrapper.text()).toContain('Enter the reusable folder password to continue.');
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('renders expired state when link is expired or revoked', async () => {
    const { useShareStore } = await import('../stores/share');
    const shareStore = useShareStore();
    shareStore.access = {
      exists: true,
      granted: false,
      hasPassword: false,
      publicAccess: false
    };
    shareStore.error = 'This folder share is expired, revoked, or locked.';

    const wrapper = mount(SharedFolderView, {
      props: {
        slug: 'travel-2024'
      },
      global: {
        stubs: {
          Avatar: true,
          EmptyState: true,
          ErrorState: {
            props: ['title', 'message'],
            template: '<div class="error-state"><h1>{{ title }}</h1><p>{{ message }}</p></div>'
          },
          FolderGrid: true,
          InfiniteLoader: true,
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    });

    expect(wrapper.text()).toContain('Could not open folder share');
    expect(wrapper.text()).toContain('This folder share is expired, revoked, or locked.');
  });

  it('explains password fallback after a share link is rejected', async () => {
    window.history.replaceState(null, '', '/share/travel-2024#token=expired-token');

    const { useShareStore } = await import('../stores/share');
    const shareStore = useShareStore();
    shareStore.unlockLink = vi.fn().mockRejectedValue(new Error('Share link rejected.'));
    shareStore.loadAccess = vi.fn(async () => {
      shareStore.access = {
        exists: true,
        granted: false,
        hasPassword: true,
        publicAccess: false
      };
      return shareStore.access;
    });

    const wrapper = mount(SharedFolderView, {
      props: {
        slug: 'travel-2024'
      },
      global: {
        stubs: {
          Avatar: true,
          EmptyState: true,
          ErrorState: true,
          FolderGrid: true,
          InfiniteLoader: true,
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    });

    await flushPromises();

    expect(wrapper.text()).toContain('This share link is no longer available.');
    expect(wrapper.text()).toContain('you can still access this folder');
    expect(wrapper.text()).not.toContain('Share link rejected.');
  });

  it('does not display any admin actions or settings controls when viewing shared folder', async () => {
    const { useShareStore } = await import('../stores/share');
    const shareStore = useShareStore();
    shareStore.access = {
      exists: true,
      granted: true,
      hasPassword: false,
      publicAccess: false
    };
    shareStore.folder = {
      id: 1,
      slug: 'travel-2024',
      name: 'Travel 2024',
      description: 'Shared vacation pics',
      imageCount: 5,
      avatarThumbnailUrl: null,
      sortTimestamp: Date.now()
    };
    shareStore.images = [];

    const wrapper = mount(SharedFolderView, {
      props: {
        slug: 'travel-2024'
      },
      global: {
        stubs: {
          Avatar: true,
          EmptyState: true,
          ErrorState: true,
          FolderGrid: true,
          InfiniteLoader: true,
          RouterLink: { template: '<a><slot /></a>' }
        }
      }
    });

    expect(wrapper.find('button[aria-label="Edit folder"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Share folder"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Settings"]').exists()).toBe(false);
  });
});

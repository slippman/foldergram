import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageDetail } from '../types/api';
import { useViewerStore } from '../stores/viewer';
import { useAppStore } from '../stores/app';
import PostView from './PostView.vue';

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router');

  return {
    ...actual,
    useRoute: () => ({
      query: {}
    }),
    useRouter: () => ({
      replace: vi.fn()
    })
  };
});

vi.mock('../components/PostViewer.vue', async () => {
  const { defineComponent } = await import('vue');

  return {
    default: defineComponent({
      name: 'PostViewer',
      props: {
        cinema: Boolean,
        isModal: Boolean,
        image: {
          type: Object,
          required: true
        }
      },
      template: '<div data-test="post-viewer">{{ image.id }}</div>'
    })
  };
});

vi.mock('../components/ErrorState.vue', async () => {
  const { defineComponent } = await import('vue');

  return {
    default: defineComponent({
      name: 'ErrorState',
      props: {
        title: String,
        message: String
      },
      template: '<div data-test="error-state">{{ title }} {{ message }}</div>'
    })
  };
});

vi.mock('../components/ConfirmDialog.vue', async () => {
  const { defineComponent } = await import('vue');

  return {
    default: defineComponent({
      name: 'ConfirmDialog',
      template: '<div data-test="confirm-dialog"><slot /><slot name="details" /></div>'
    })
  };
});

function createImageDetail(id: number): ImageDetail {
  return {
    id,
    folderId: 7,
    folderSlug: 'peopleplanet',
    folderName: 'PeoplePlanet',
    folderPath: 'PeoplePlanet',
    folderBreadcrumb: null,
    filename: `image-${id}.jpg`,
    width: 1200,
    height: 1500,
    mediaType: 'image',
    durationMs: null,
    isAnimated: false,
    thumbnailUrl: `/thumbnails/${id}.webp`,
    previewUrl: `/previews/${id}.webp`,
    sortTimestamp: 1_777_000_000_000 + id,
    takenAt: 1_777_000_000_000 + id,
    folderAvatarImageId: null,
    relativePath: `PeoplePlanet/image-${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 123_456,
    exif: null,
    originalUrl: `/api/originals/${id}`,
    playbackStrategy: null,
    previousImageId: null,
    nextImageId: null
  };
}

describe('PostView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('does not render the previously loaded post while a new modal image is loading', async () => {
    const viewerStore = useViewerStore();
    viewerStore.$patch({
      image: createImageDetail(1),
      loading: false,
      deleting: false,
      error: null
    });

    let resolveLoad: (() => void) | null = null;
    vi.spyOn(viewerStore, 'loadImage').mockImplementation(async (id: number) => {
      viewerStore.loading = true;
      viewerStore.error = null;

      await new Promise<void>((resolve) => {
        resolveLoad = resolve;
      });

      viewerStore.image = createImageDetail(id);
      viewerStore.loading = false;
    });

    const wrapper = mount(PostView, {
      props: {
        id: '2',
        modal: true
      },
      global: {
        stubs: {
          Transition: false
        }
      }
    });

    expect(wrapper.find('[data-test="post-viewer"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Loading post...');

    resolveLoad?.();
    await flushPromises();

    expect(wrapper.get('[data-test="post-viewer"]').text()).toBe('2');
  });
  it('keeps server-selected Cinema while preferences are still loading', async () => {
    document.documentElement.dataset.cinemaEntry = 'true';
    const viewerStore = useViewerStore();
    vi.spyOn(viewerStore, 'loadImage').mockImplementation(async () => { viewerStore.loading = true; });
    const wrapper = mount(PostView, { props: { id: '109' } });
    try {
      await flushPromises();
      expect(wrapper.attributes('data-album-theme')).toBe('unknown');
      expect(wrapper.classes('image-view--standalone-cinema')).toBe(true);
      expect(wrapper.text()).not.toContain('Loading post...');
      useAppStore().stats = { preferences: { folderDisplayTheme: 'cinema' } } as any;
      await flushPromises();
      expect(wrapper.attributes('data-album-theme')).toBe('cinema');
    } finally {
      wrapper.unmount();
      delete document.documentElement.dataset.cinemaEntry;
    }
  });

  it.each(['cinema', 'classic'] as const)('restores the %s layout on a direct post reload', async (theme) => {
    vi.spyOn(useAppStore(), 'folderDisplayTheme', 'get').mockReturnValue(theme);
    useAppStore().stats = { preferences: { folderDisplayTheme: theme } } as any;
    const viewerStore = useViewerStore();
    vi.spyOn(viewerStore, 'loadImage').mockImplementation(async (id) => {
      viewerStore.image = createImageDetail(id);
    });
    const wrapper = mount(PostView, { props: { id: '109' } });
    await flushPromises();
    const viewer = wrapper.findComponent({ name: 'PostViewer' });
    expect(viewer.props('cinema')).toBe(theme === 'cinema');
    expect(viewer.props('isModal')).toBe(theme === 'cinema');
    expect(wrapper.classes('image-view--standalone-cinema')).toBe(theme === 'cinema');
    wrapper.unmount();
  });

  it('keeps the current Cinema photo visible while the next post loads', async () => {
    const viewerStore = useViewerStore();
    vi.spyOn(viewerStore, 'loadImage').mockImplementation(async (id: number) => {
      if (id === 1) viewerStore.image = createImageDetail(1);
      else viewerStore.loading = true;
    });
    const wrapper = mount(PostView, { props: { id: '1', modal: true, cinema: true } });
    await flushPromises();
    await wrapper.setProps({ id: '2' });
    expect(wrapper.get('[data-test="post-viewer"]').text()).toBe('1');
    expect(wrapper.text()).not.toContain('Loading post...');
    viewerStore.image = createImageDetail(2);
    viewerStore.loading = false;
    await flushPromises();
    expect(wrapper.get('[data-test="post-viewer"]').text()).toBe('2');
  });

  it.each([false, true])('deletes the confirmed photo when navigation completes (permanent: %s)', async (permanent) => {
    const viewerStore = useViewerStore();
    vi.spyOn(viewerStore, 'loadImage').mockImplementation(async (id: number) => {
      if (id === 1) viewerStore.image = createImageDetail(1);
      else viewerStore.loading = true;
    });
    const deleteImage = vi.spyOn(viewerStore, 'deleteImage').mockResolvedValue({ id: 1, folderSlug: 'peopleplanet' } as any);
    const wrapper = mount(PostView, { props: { id: '1', modal: true, cinema: true } });
    await flushPromises();
    await wrapper.setProps({ id: '2' });
    expect(wrapper.get('[data-test="post-viewer"]').text()).toBe('1');
    wrapper.findComponent({ name: 'PostViewer' }).vm.$emit('delete');
    await flushPromises();
    await wrapper.get('input[type="checkbox"]').setValue(permanent);
    viewerStore.image = createImageDetail(2);
    viewerStore.loading = false;
    await flushPromises();
    wrapper.findComponent({ name: 'ConfirmDialog' }).vm.$emit('confirm');
    await flushPromises();
    expect(deleteImage).toHaveBeenCalledWith(1, { permanent });
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

});

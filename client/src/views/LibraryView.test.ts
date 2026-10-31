import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, expect, it, vi } from 'vitest';
import LibraryView from './LibraryView.vue';
import { useFoldersStore } from '../stores/folders';
import { useAppStore } from '../stores/app';
import type { FolderSummary } from '../types/api';

vi.mock('vue-router', async () => ({
  ...await vi.importActual('vue-router'),
  useRouter: () => ({ push: vi.fn() })
}));
beforeEach(() => { setActivePinia(createPinia()); });
it('opens Share album with the visibility just saved from the open Cinema options menu', async () => {
  const folder: FolderSummary = {
    id: 1, slug: 'trip', name: 'Trip', description: null, folderPath: 'Trip', breadcrumb: null,
    imageCount: 2, videoCount: 0, latestImageMtimeMs: null, avatarImageId: null, avatarUrl: null,
    shareMode: 'library'
  };
  const folders = useFoldersStore();
  folders.items = [folder];
  vi.spyOn(folders, 'fetchFolders').mockResolvedValue();
  vi.spyOn(useAppStore(), 'folderDisplayTheme', 'get').mockReturnValue('cinema');
  vi.spyOn(folders, 'updateShareMode').mockImplementation(async () => {
    const updated = { ...folder, shareMode: 'link-only' as const };
    folders.items = [updated];
    return updated;
  });
  const wrapper = mount(LibraryView, { global: { stubs: {
    RouterLink: { template: '<a><slot /></a>' }, Avatar: true, ConfirmDialog: true,
    Teleport: true, FolderShareModal: { props: ['folder'], template: '<div data-test="share-visibility">{{ folder.shareMode }}</div>' }
  } } });
  await flushPromises();
  await wrapper.get('button[aria-label="More options"]').trigger('click');
  const select = wrapper.findAll('select').find(select => select.find('option[value="link-only"]').exists())!;
  await select.setValue('link-only');
  await flushPromises();
  await wrapper.findAll('button').find(button => button.text().includes('Share album'))!.trigger('click');
  expect(wrapper.get('[data-test="share-visibility"]').text()).toBe('link-only');
  wrapper.unmount();
});

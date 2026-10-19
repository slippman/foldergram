import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderSummary } from '../types/api';
import FolderShareModal from './FolderShareModal.vue';
import * as galleryApi from '../api/gallery';

function createFolder(overrides: Partial<FolderSummary> = {}): FolderSummary {
  return {
    id: 1,
    slug: 'travel-2024',
    name: 'Travel 2024',
    description: 'Vacation photos.',
    folderPath: 'travel-2024',
    breadcrumb: 'Travel 2024',
    imageCount: 10,
    videoCount: 2,
    latestImageMtimeMs: Date.now(),
    avatarImageId: null,
    avatarUrl: null,
    ...overrides
  };
}

describe('FolderShareModal', () => {
  it.each([{ cinema: false, succeeds: true }, { cinema: true, succeeds: true }, { cinema: true, succeeds: false }])('confirms successful copies without false success or Classic changes: %j', async ({ cinema, succeeds }) => {
    vi.useFakeTimers();
    const { useFoldersStore } = await import('../stores/folders');
    const store = useFoldersStore();
    store.loadShareLinks = vi.fn().mockResolvedValue(undefined);
    store.shareLinks = [{ id: 7, folderId: 1, tokenPrefix: 'test', expiresAt: null, revokedAt: null,
      createdAt: new Date().toISOString(), lastUsedAt: null, status: 'active', canCopy: true }];
    const shareUrl = '/share/travel-2024?preview=test#token=test';
    const copy = vi.spyOn(galleryApi, 'copyFolderShareLink').mockResolvedValue({ shareUrl });
    const writeText = succeeds ? vi.fn().mockResolvedValue(undefined) : vi.fn().mockRejectedValue(new Error('Clipboard blocked'));
    const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn().mockReturnValue(false) });
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const wrapper = mount(FolderShareModal, { props: { folder: createFolder(), cinema } });
      const button = wrapper.findAll('button').find(button => button.text().trim() === 'Copy')!;
      await button.trigger('click');
      await flushPromises();
      expect(copy).toHaveBeenCalledWith('travel-2024', 7);
      expect(writeText).toHaveBeenCalledWith(new URL(shareUrl, window.location.origin).href);
      expect(store.lastCreatedShareUrl).toBe(cinema ? null : shareUrl);
      if (!cinema || !succeeds) expect(wrapper.text()).toContain(succeeds ? 'Link copied' : 'Select the link below to copy it');
      if (cinema && succeeds) {
        expect(wrapper.findAll('input[readonly]')).toHaveLength(0);
        expect(wrapper.find('[role=status]').exists()).toBe(false);
      }
      expect(button.text().trim()).toBe(cinema && succeeds ? 'Copied!' : 'Copy');
      expect(button.find('.i-fluent-checkmark-20-regular').exists()).toBe(cinema && succeeds);
      await vi.advanceTimersByTimeAsync(2000);
      expect(button.text().trim()).toBe('Copy');
      wrapper.unmount();
    } finally {
      copy.mockRestore();
      if (originalExec) Object.defineProperty(document, 'execCommand', originalExec);
      else Reflect.deleteProperty(document, 'execCommand');
      vi.useRealTimers();
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
  it.each([true, false])('creates one Cinema link and automatically copies it, with manual fallback only if blocked: %s', async succeeds => {
    vi.useFakeTimers();
    const { useFoldersStore } = await import('../stores/folders');
    const store = useFoldersStore();
    store.loadShareLinks = vi.fn().mockResolvedValue(undefined);
    const link = { id: 42, folderId: 1, tokenPrefix: 'new-link', expiresAt: null, revokedAt: null,
      createdAt: new Date().toISOString(), lastUsedAt: null, status: 'active' as const, canCopy: true };
    const shareUrl = '/share/travel-2024#token=new-secret';
    const create = vi.spyOn(galleryApi, 'createFolderShareLink').mockResolvedValue({ link, shareUrl } as any);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
    const writeText = succeeds ? vi.fn().mockResolvedValue(undefined) : vi.fn().mockRejectedValue(new Error('Blocked'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => { throw new Error('Blocked'); }) });
    const wrapper = mount(FolderShareModal, { props: { folder: createFolder(), cinema: true } });
    try {
      const button = wrapper.findAll('button').find(button => button.text().trim() === 'Create Link')!;
      await button.trigger('click'); await flushPromises();
      expect(create).toHaveBeenCalledOnce();
      expect(writeText).toHaveBeenCalledWith(new URL(shareUrl, window.location.origin).href);
      expect(store.shareLinks.map(link => link.id)).toEqual([42]);
      expect(wrapper.findAll('input[readonly]')).toHaveLength(succeeds ? 0 : 1);
      expect(wrapper.findAll('button').filter(button => button.text().trim() === 'Copy')).toHaveLength(1);
      expect(wrapper.find('[role=status]').exists()).toBe(false);
      expect(button.text().trim()).toBe(succeeds ? 'Link created and copied!' : 'Create Link');
      expect(wrapper.text()).not.toContain('Copy this link now');
      if (!succeeds) expect(wrapper.text()).toContain('Select the link below to copy it');
      await vi.advanceTimersByTimeAsync(2000);
      expect(button.text().trim()).toBe('Create Link');
    } finally {
      wrapper.unmount(); create.mockRestore(); vi.useRealTimers();
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (originalExec) Object.defineProperty(document, 'execCommand', originalExec);
      else Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it.each([true, false])('saves album visibility with rollback on failure: %s', async succeeds => {
    const { useFoldersStore } = await import('../stores/folders');
    const store = useFoldersStore();
    store.loadShareLinks = vi.fn().mockResolvedValue(undefined);
    store.updateShareMode = succeeds
      ? vi.fn().mockResolvedValue(createFolder({ shareMode: 'link-only' }))
      : vi.fn().mockRejectedValue(new Error('Cannot save visibility'));
    const wrapper = mount(FolderShareModal, { props: { folder: createFolder(), cinema: true } });
    const select = wrapper.get('select');
    expect((select.element as HTMLSelectElement).value).toBe('library');
    await select.setValue('link-only');
    await flushPromises();
    expect(store.updateShareMode).toHaveBeenCalledWith('travel-2024', 'link-only');
    expect((select.element as HTMLSelectElement).value).toBe(succeeds ? 'link-only' : 'library');
    expect(wrapper.text()).toContain(succeeds ? 'Album visibility saved.' : 'Cannot save visibility');
    wrapper.unmount();
  });

  it('preserves Classic controls without the Cinema visibility panel', async () => {
    const { useFoldersStore } = await import('../stores/folders');
    useFoldersStore().loadShareLinks = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(FolderShareModal, { props: { folder: createFolder() } });
    expect(wrapper.text()).not.toContain('Album visibility');
    wrapper.unmount();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders modal in protected mode with link and password controls', () => {
    const wrapper = mount(FolderShareModal, {
      props: {
        folder: createFolder()
      }
    });

    expect(wrapper.text()).toContain('Share Folder');
    expect(wrapper.text()).toContain('Share links and password access work independently');
    expect(wrapper.text()).toContain('Share links');
    expect(wrapper.text()).toContain('Password access');
    expect(wrapper.text()).toContain('does not add password protection to share links');
  });

  it('summarizes simultaneous link and password access', async () => {
    const { useFoldersStore } = await import('../stores/folders');
    const foldersStore = useFoldersStore();
    foldersStore.shareLinks = [
      {
        id: 7,
        folderId: 1,
        tokenPrefix: 'abcdefgh',
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        status: 'active'
      }
    ];
    foldersStore.sharePassword = { enabled: true, updatedAt: new Date().toISOString() };
    foldersStore.loadShareLinks = vi.fn().mockResolvedValue(undefined);

    const wrapper = mount(FolderShareModal, {
      props: {
        folder: createFolder()
      }
    });

    expect(wrapper.text()).toContain('Active share links: 1. Password access: enabled.');
    expect(wrapper.text()).toContain('Copy Folder Address');
  });

  it('renders public mode information when global public access is enabled', async () => {
    const { useFoldersStore } = await import('../stores/folders');
    const foldersStore = useFoldersStore();
    foldersStore.shareLinks = [];
    foldersStore.sharePassword = { enabled: false, updatedAt: null };
    foldersStore.sharePublicFolderUrl = '/folders/travel-2024';
    foldersStore.sharePublicAccess = true;

    const wrapper = mount(FolderShareModal, {
      props: {
        folder: createFolder()
      }
    });

    expect(wrapper.text()).toContain('Public folder URL');
    expect((wrapper.find('input.share-url-input').element as HTMLInputElement).value).toContain('/folders/travel-2024');
  });

  it('copies share link to clipboard when copy button is clicked', async () => {
    const { vi } = await import('vitest');
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true
    });

    const { useFoldersStore } = await import('../stores/folders');
    const foldersStore = useFoldersStore();
    foldersStore.shareLinks = [];
    foldersStore.sharePassword = { enabled: false, updatedAt: null };
    foldersStore.sharePublicAccess = false;
    foldersStore.loadShareLinks = vi.fn().mockResolvedValue(undefined);
    foldersStore.lastCreatedShareUrl = '/share/travel-2024#token=test-token';

    const wrapper = mount(FolderShareModal, {
      props: {
        folder: createFolder()
      }
    });

    const expectedShareUrl = new URL('/share/travel-2024#token=test-token', window.location.origin).toString();
    const createdLinkInput = wrapper
      .findAll('input.share-url-input')
      .find((input) => (input.element as HTMLInputElement).value === expectedShareUrl);
    expect(createdLinkInput).toBeDefined();

    const copyButton = wrapper
      .findAll('button.share-icon-button')
      .find((button) => createdLinkInput!.element.parentElement?.contains(button.element));
    expect(copyButton).toBeDefined();

    await copyButton!.trigger('click');
    expect(writeTextMock).toHaveBeenCalledWith(expectedShareUrl);
  });
});

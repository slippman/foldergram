import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOCALE, i18n } from '../locales';
import type { FeedItem } from '../types/api';
import { useAuthStore } from './auth';
import * as gallery from '../api/gallery';

import { useLikesStore } from './likes';

function createFeedItem(id: number): FeedItem {
  return {
    id,
    folderId: 1,
    folderSlug: 'animal-planet',
    folderName: 'Animal Planet',
    folderPath: 'animal-planet',
    folderBreadcrumb: null,
    filename: `post-${id}.jpg`,
    width: 1080,
    height: 1350,
    mediaType: 'image',
    durationMs: null,
    isAnimated: false,
    thumbnailUrl: `/thumbs/${id}.webp`,
    previewUrl: `/previews/${id}.webp`,
    sortTimestamp: 1_777_000_000_000 + id,
    takenAt: 1_777_000_000_000 + id
  };
}

describe('useLikesStore localization', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    i18n.global.locale.value = DEFAULT_LOCALE;
  });

  it('reacts to locale changes for shared and local saved-item labels', () => {
    const store = useLikesStore();

    store.syncFromItems([createFeedItem(1)], 'shared');

    expect(store.collectionLabel).toBe('Likes');
    expect(store.collectionSectionLabel).toBe('Liked posts');

    i18n.global.locale.value = 'zh';

    expect(store.collectionLabel).toBe('赞过');
    expect(store.collectionSectionLabel).toBe('已赞帖子');
    expect(store.toggleAriaLabel(false)).toBe('点赞帖子');

    store.syncFromItems([createFeedItem(2)], 'local');

    expect(store.collectionLabel).toBe('收藏');
    expect(store.collectionSectionLabel).toBe('收藏帖子');
    expect(store.toggleAriaLabel(true)).toBe('取消收藏帖子');
  });
});


describe('personal likes account switches', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks(); });
  it('loads personal likes from the account API', async () => {
    const auth = useAuthStore(); auth.user = { id: 1, email: 'one@example.com', displayName: 'One' }; auth.likesMode = 'personal';
    vi.spyOn(gallery, 'fetchLikes').mockResolvedValue({ items: [createFeedItem(1)] });
    const store = useLikesStore(); await store.initialize();
    expect(store.mode).toBe('personal'); expect(store.likedIds).toEqual([1]);
  });
  it('discards a pending response after the person signs out or switches accounts', async () => {
    const auth = useAuthStore(); auth.user = { id: 1, email: 'one@example.com', displayName: 'One' }; auth.likesMode = 'personal';
    let finish!: (value: { items: FeedItem[] }) => void;
    vi.spyOn(gallery, 'fetchLikes').mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const store = useLikesStore(); const pending = store.initialize();
    auth.user = { id: 2, email: 'two@example.com', displayName: 'Two' };
    store.resetForRebuild(); store.syncFromItems([createFeedItem(2)], 'personal');
    finish({ items: [createFeedItem(1)] }); await pending;
    expect(store.likedIds).toEqual([2]); expect(store.items.map(item => item.id)).toEqual([2]);
  });
});

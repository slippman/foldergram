import type { FeedItem, ImageDetail, SharedFeedItem, SharedImageDetail } from '../types/api';

// Shared responses contain only scoped preview URLs and public camera metadata.
// Fill presentation fields for the common components without inventing original URLs.
export function sharedFeedItem(item: SharedFeedItem): FeedItem {
  return { ...item, folderPath: '', folderBreadcrumb: null, takenAt: item.takenAt ?? null };
}
export function sharedImageDetail(image: SharedImageDetail): ImageDetail {
  return {
    ...sharedFeedItem(image), ...image, takenAt: image.takenAt ?? null,
    folderAvatarImageId: null, relativePath: '', originalUrl: '',
    fileSize: image.fileSize ?? 0, exif: image.exif ?? null, playbackStrategy: 'preview'
  };
}

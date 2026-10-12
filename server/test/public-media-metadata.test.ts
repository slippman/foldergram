import { describe, expect, it } from 'vitest';
import { redactPublicMediaMetadata } from '../src/utils/public-media-metadata.js';

describe('public media metadata', () => {
  it('retains camera details but hides coordinates and internal paths on posts and slides', () => {
    const media = { id: 1, absolutePath: '/private/photo.jpg', relativePath: 'photo.jpg',
      exifJson: '{}', exif: { cameraMake: 'Apple', cameraModel: 'iPhone', iso: 100,
        latitude: 40, longitude: -105, altitudeMeters: 1600 } };
    const expected = { id: 1, exif: { cameraMake: 'Apple', cameraModel: 'iPhone', iso: 100 } };
    expect(redactPublicMediaMetadata({ ...media, mediaItems: [media] }))
      .toEqual({ ...expected, mediaItems: [expected] });
  });
});

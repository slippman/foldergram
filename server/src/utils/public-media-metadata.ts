const PUBLIC_SENSITIVE_MEDIA_KEYS = new Set([
  'absolutePath',
  'exifJson',
  'relativePath',
  'sourcePath'
]);

export function redactPublicMediaMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactPublicMediaMetadata(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PUBLIC_SENSITIVE_MEDIA_KEYS.has(key))
      .map(([key, item]) => [key, key === 'exif'
        ? publicCameraMetadata(item)
        : redactPublicMediaMetadata(item)])
  );
}

export function publicCameraMetadata(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  const allowed = new Set(['cameraMake', 'cameraModel', 'lensModel', 'fNumber',
    'exposureTimeSeconds', 'iso', 'focalLengthMm', 'focalLength35mmMm']);
  return Object.fromEntries(Object.entries(value).filter(([key]) => allowed.has(key)));
}


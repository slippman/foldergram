import { describe, expect, it, vi } from 'vitest';

const { parseMock } = vi.hoisted(() => ({
  parseMock: vi.fn()
}));

vi.mock('exifr', () => ({
  default: {
    parse: parseMock
  }
}));

describe('EXIF parsing tolerance', () => {
  it('uses the camera timezone offset regardless of the server timezone', async () => {
    parseMock.mockResolvedValueOnce({ DateTimeOriginal: '2026:10:03 18:23:55', OffsetTimeOriginal: '-06:00' });
    const { extractTakenAt } = await import('../src/utils/exif-utils.js');
    expect(await extractTakenAt('/tmp/edited-export.jpeg')).toBe(Date.parse('2026-10-04T00:23:55Z'));
  });
  it('recognizes the translated EXIF digitization tag when capture time is missing', async () => {
    parseMock.mockResolvedValueOnce({ CreateDate: '2026:10:03 18:23:55', OffsetTimeDigitized: '-06:00' });
    const { extractTakenAt } = await import('../src/utils/exif-utils.js');
    expect(await extractTakenAt('/tmp/export.jpeg')).toBe(Date.parse('2026-10-04T00:23:55Z'));
  });
  it('treats parser failures as missing EXIF instead of scan errors', async () => {
    parseMock.mockRejectedValueOnce(new Error('Unknown file format'));

    const { extractTakenAt } = await import('../src/utils/exif-utils.js');

    await expect(extractTakenAt('/tmp/example.webp')).resolves.toBeNull();
  });
});

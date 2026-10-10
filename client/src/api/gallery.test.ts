import { afterEach, describe, expect, it, vi } from 'vitest';

import { addImageToCollection, fetchSharedImage, fetchSharedPost, updateFolderDisplayTheme } from './gallery';

describe('post and image API namespaces', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the canonical shared-post endpoint for new shared links and preserves the legacy image endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 42 })
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchSharedPost(42);
    await fetchSharedImage(17);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/share/posts/42');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/share/images/17');
  });

  it('uses canonical post IDs for collection membership mutations', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 42, isSaved: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await addImageToCollection('trip-picks', 42);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/collections/trip-picks/posts/42',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

it('sends folder themes as JSON with the mutation intent header', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ theme: 'cinema' }), {
    headers: { 'content-type': 'application/json' }
  }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await updateFolderDisplayTheme('cinema')).toEqual({ theme: 'cinema' });
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/admin/settings/folder-display-theme');
  expect(request.headers.get('content-type')).toBe('application/json');
  expect(request.headers.get('x-foldergram-intent')).toBe('1');
  expect(JSON.parse(request.body)).toEqual({ theme: 'cinema' });
});

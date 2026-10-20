import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestJson } from './http';
import { recordAlbumView } from './activity';

describe('requestJson', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('accepts an empty 204 when recording regular and shared album views', async () => {
    const json = vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json });
    vi.stubGlobal('fetch', fetchMock);

    await expect(recordAlbumView('trip', false)).resolves.toBeUndefined();
    await expect(recordAlbumView('trip', true)).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/folders/trip/view', '/api/share/folders/trip/view'
    ]);
    expect(fetchMock.mock.calls[0][1].headers.get('x-foldergram-intent')).toBe('1');
  });

  it('still reports malformed JSON on responses that should contain a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Invalid JSON'))
    }));
    await expect(requestJson('/api/feed')).rejects.toThrow('Invalid JSON');
  });

  it('uses no-store caching for safe reads by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await requestJson('/api/feed');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feed',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'same-origin'
      })
    );
  });

  it('aborts a stalled safe read and reports a retryable timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const response = requestJson('/api/auth/status');
    const assertion = expect(response).rejects.toMatchObject({ status: 408, message: 'Loading took too long. Please try again.' });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });
  it('preserves an explicit cache mode when one is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    await requestJson('/api/feed', {
      cache: 'reload'
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/feed',
      expect.objectContaining({
        cache: 'reload'
      })
    );
  });
});

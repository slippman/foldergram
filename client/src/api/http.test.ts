import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestJson } from './http';

describe('requestJson', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

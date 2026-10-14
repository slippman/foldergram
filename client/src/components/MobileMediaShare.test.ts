import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import MobileMediaShare from './MobileMediaShare.vue';
const mountButton = (cinema = false, mediaType: 'image' | 'video' = 'image') => mount(MobileMediaShare, { props: { url: '/api/originals/1?download=1', cinema, mediaType } });
// Existing transfer tests exercise GET bodies; preflight is independently tested below.
function stubFetch(implementation: typeof fetch | ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => init?.method === 'HEAD'
    ? Promise.resolve(new Response(null, { headers: { 'Content-Length': '8' } }))
    : implementation(input, init));
}
enableAutoUnmount(afterEach);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('mobile photo sharing', () => {
  it.each(['fetch', 'share'])('exposes Download after a %s failure', async (failure) => {
    const share = failure === 'share'
      ? vi.fn().mockRejectedValue(new Error('Share failed'))
      : vi.fn();
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    stubFetch(failure === 'fetch'
      ? vi.fn().mockRejectedValue(new Error('Fetch failed'))
      : vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/jpeg' }))));
    const wrapper = mountButton();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('a').exists()).toBe(true));
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.get('a').attributes('href')).toBe('/api/originals/1?download=1');
    expect(wrapper.get('a').attributes('download')).toBeDefined();
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });
  it('shares the original file and treats cancellation as normal', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    stubFetch(vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/jpeg' }), { headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="birthday.jpg"' } })));
    const wrapper = mountButton();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe('birthday.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
  it('waits for another tap when preparing the file consumes activation', async () => {
    const activation = { isActive: false };
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: activation });
    const fetch = vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/jpeg' })));
    stubFetch(fetch);
    const wrapper = mountButton();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('.mobile-media-share__ready').exists()).toBe(true);
      expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    });
    expect(share).not.toHaveBeenCalled();
    activation.isActive = true;
    await wrapper.get('button').trigger('click');
    expect(share).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['Android', 'iPhone'])('uses the standard Foldergram share icon on %s', userAgent => {
    vi.stubGlobal('navigator', { userAgent, share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    expect(mountButton(true).find('.i-fluent-share-20-regular').exists()).toBe(true);
  });
  it.each(['Android', 'iPhone'])('preserves the Classic native share icon on %s', userAgent => {
    vi.stubGlobal('navigator', { userAgent, share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const wrapper = mountButton();
    expect(wrapper.find('.i-fluent-share-20-regular').exists()).toBe(false);
    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('circle')).toHaveLength(userAgent === 'Android' ? 3 : 0);
  });
  it('shares video files with the same action', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    stubFetch(vi.fn().mockResolvedValue(new Response('video', { headers: { 'Content-Type': 'video/mp4' } })));
    const wrapper = mountButton(true);
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => expect(wrapper.find('.mobile-media-share__confirm').exists()).toBe(true));
    await wrapper.get('.mobile-media-share__confirm').trigger('click');
    await flushPromises();
    expect(share.mock.calls[0][0].files[0].type).toBe('video/mp4');
    expect(wrapper.find('.i-fluent-share-20-regular').exists()).toBe(true);
  });
  it.each([
    ['attachment; filename=IMG_2732.mov', 'IMG_2732.mov'],
    ['attachment; filename="Birthday movie.mov"', 'Birthday movie.mov'],
    ["attachment; filename*=UTF-8''Birthday%20movie.mov", 'Birthday movie.mov'],
    [null, 'media.mov']
  ])('shares a QuickTime movie with a recognized filename from %s', async (disposition, expectedName) => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    const headers = new Headers({ 'Content-Type': 'video/quicktime' });
    if (disposition) headers.set('Content-Disposition', disposition);
    stubFetch(vi.fn().mockResolvedValue(new Response('quicktime video', { headers })));
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click');
      await flushPromises();
      await wrapper.get('.mobile-media-share__confirm').trigger('click');
      await flushPromises();
      const sharedFile = share.mock.calls[0][0].files[0];
      expect(sharedFile.name).toBe(expectedName);
      expect(sharedFile.type).toBe('video/quicktime');
      expect(sharedFile.size).toBe(15);
    } finally { wrapper.unmount(); }
  });
  it('offers Download without fetching when the device cannot share video files', () => {
    const fetch = vi.fn();
    stubFetch(fetch);
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn(({ files }) => files[0].type === 'image/jpeg') });
    const wrapper = mountButton(true, 'video');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('a[download]').exists()).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows video progress and allows a slow transfer that keeps receiving data', async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    stubFetch(vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '8', 'Content-Disposition': 'attachment; filename="party.mp4"' } })));
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    stream.enqueue(new Uint8Array([1, 2, 3, 4]));
    await flushPromises();
    expect(wrapper.text()).toContain('Preparing video… 50%');
    expect(wrapper.text()).not.toContain('Preparing photo');
    await vi.advanceTimersByTimeAsync(45000);
    stream.enqueue(new Uint8Array([5, 6]));
    await flushPromises();
    expect(wrapper.text()).toContain('75%');
    await vi.advanceTimersByTimeAsync(45000);
    stream.enqueue(new Uint8Array([7, 8]));
    stream.close();
    await flushPromises();
    expect(share).not.toHaveBeenCalled();
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
    expect(wrapper.find('.mobile-media-share__ready').exists()).toBe(false);
    await wrapper.get('.mobile-media-share__confirm').trigger('click');
    await flushPromises();
    expect(share).toHaveBeenCalledOnce();
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe('party.mp4');
    expect(file.type).toBe('video/mp4');
    expect(file.size).toBe(8);
    expect(wrapper.text()).not.toContain('Preparing');
    wrapper.unmount();
  });
  it.each(['headers', 'body'])('ends a stalled %s transfer and offers Download', async (phase) => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel });
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true) });
    stubFetch(vi.fn((_url, options) => {
      signal = options.signal;
      return phase === 'headers' ? new Promise(() => {}) : Promise.resolve(new Response(body, { headers: { 'Content-Type': 'video/mp4' } }));
    }));
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(60000);
    await flushPromises();
    expect(signal.aborted).toBe(true);
    expect(wrapper.get('a[download]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Transfer stalled or took too long. Try Download.');
    expect(wrapper.text()).not.toContain('Preparing');
    expect(share).not.toHaveBeenCalled();
    if (phase === 'body') expect(cancel).toHaveBeenCalled();
    wrapper.unmount();
  });
  it('bounds total preparation time even if data trickles in continuously', async () => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } });
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    stubFetch(vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'video/mp4' } })));
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    const trickle = setInterval(() => stream.enqueue(new Uint8Array([1])), 30000);
    await vi.advanceTimersByTimeAsync(299999);
    clearInterval(trickle);
    expect(wrapper.find('a[download]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(wrapper.text()).toContain('Transfer stalled or took too long. Try Download.');
    wrapper.unmount();
  });
  it('aborts the transfer when its component is removed', async () => {
    let signal!: AbortSignal;
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    stubFetch(vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}); }));
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    wrapper.unmount();
    await flushPromises();
    expect(signal.aborted).toBe(true);
  });
  it('cancels preparation and allows another attempt', async () => {
    let signal!: AbortSignal;
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: false } });
    const fetch = vi.fn().mockImplementationOnce((_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    }).mockResolvedValue(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }));
    stubFetch(fetch);
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    await wrapper.get('.mobile-media-share__progress button').trigger('click');
    expect(signal.aborted).toBe(true);
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Tap to share');
    expect(wrapper.text()).not.toContain('Preparing');
    expect(fetch).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('keeps the same popup from preparation through ready, and Cancel closes it', async () => {
    let finish!: (response: Response) => void;
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    stubFetch(vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    const popup = wrapper.get('.mobile-media-share__progress').element;
    expect(wrapper.text()).toContain('Preparing video');
    finish(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }));
    await flushPromises();
    expect(wrapper.get('.mobile-media-share__progress').element).toBe(popup);
    expect(wrapper.get('.mobile-media-share__progress').classes()).toContain('mobile-media-share__progress--ready');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('100');
    expect(share).not.toHaveBeenCalled();
    const cancel = wrapper.findAll('.mobile-media-share__progress button').find(button => button.text() === 'Cancel')!;
    await cancel.trigger('click');
    expect(wrapper.find('.mobile-media-share__progress').exists()).toBe(false);
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
  it('aborts obsolete preparation on navigation without changing the next file', async () => {
    let finishOld!: (response: Response) => void;
    let oldSignal!: AbortSignal;
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: false } });
    const fetch = vi.fn().mockImplementationOnce((_url, options) => {
      oldSignal = options.signal;
      return new Promise<Response>(resolve => { finishOld = resolve; });
    }).mockResolvedValue(new Response('new video', { headers: { 'Content-Type': 'video/mp4' } }));
    stubFetch(fetch);
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    await wrapper.setProps({ url: '/another-video' });
    expect(oldSignal.aborted).toBe(true);
    await wrapper.get('button').trigger('click');
    await flushPromises();
    finishOld(new Response('old file'));
    await flushPromises();
    expect(wrapper.text()).toContain('Tap to share');
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).not.toContain('Could not');
    wrapper.unmount();
  });
  it('stops preparing once the file is ready even while the native share sheet stays open', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(() => new Promise(() => {})), canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    stubFetch(vi.fn().mockResolvedValue(new Response('video', { headers: { 'Content-Type': 'video/mp4' } })));
    const wrapper = mountButton(true, 'video');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('Preparing');
    await wrapper.get('.mobile-media-share__confirm').trigger('click');
    await flushPromises();
    expect(wrapper.find('.mobile-media-share__progress').exists()).toBe(false);
    wrapper.unmount();
  });
  it('allows only one movie through preparation, ready, and the native share sheet', async () => {
    let finish!: (response: Response) => void;
    let finishShare!: () => void;
    const share = vi.fn(() => new Promise<void>(resolve => { finishShare = resolve; }));
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
    stubFetch(fetch);
    const one = mountButton(true, 'video');
    const two = mountButton(true, 'video');
    await one.get('button').trigger('click'); await flushPromises();
    await two.get('button').trigger('click'); await flushPromises();
    expect(fetch).toHaveBeenCalledOnce();
    expect(two.get('.mobile-media-share__busy').text()).toContain('already in progress');
    const popup = one.get('.mobile-media-share__progress').element as HTMLElement;
    const scroll = vi.fn();
    popup.scrollIntoView = scroll;
    const focus = vi.spyOn(popup, 'focus');
    await two.get('.mobile-media-share__busy button').trigger('click');
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    finish(new Response('video', { headers: { 'Content-Type': 'video/mp4' } })); await flushPromises();
    await two.get('button').trigger('click');
    expect(two.find('.mobile-media-share__busy').exists()).toBe(true);
    await one.get('.mobile-media-share__confirm').trigger('click'); await flushPromises();
    await two.get('button').trigger('click');
    expect(fetch).toHaveBeenCalledOnce();
    finishShare(); await flushPromises();
    expect(two.find('.mobile-media-share__busy').exists()).toBe(false);
    await two.get('button').trigger('click'); await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['cancel', 'unmount', 'navigation', 'failure', 'oversize', 'native cancel'])('releases the movie slot after %s', async (ending) => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')), canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return Promise.resolve(new Response(null, { headers: { 'Content-Length': ending === 'oversize' ? '250000001' : '8' } }));
      if (ending === 'failure') return Promise.reject(new Error('Failed'));
      if (ending === 'native cancel') return Promise.resolve(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }));
      return new Promise<Response>(() => {});
    });
    vi.stubGlobal('fetch', fetch);
    const one = mountButton(true, 'video');
    const two = mountButton(true, 'video');
    await one.get('button').trigger('click'); await flushPromises();
    if (ending === 'cancel') await one.get('.mobile-media-share__popup-actions button').trigger('click');
    if (ending === 'unmount') one.unmount();
    if (ending === 'navigation') await one.setProps({ url: '/different-video' });
    if (ending === 'native cancel') await one.get('.mobile-media-share__confirm').trigger('click');
    await flushPromises();
    const previous = fetch.mock.calls.length;
    await two.get('button').trigger('click'); await flushPromises();
    expect(two.find('.mobile-media-share__busy').exists()).toBe(false);
    expect(fetch.mock.calls.length).toBeGreaterThan(previous);
  });
  it('keeps photos and Classic sharing outside the Cinema movie restriction', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    stubFetch(fetch);
    const movie = mountButton(true, 'video');
    const photo = mountButton(true, 'image');
    const classic = mountButton(false, 'video');
    await movie.get('button').trigger('click'); await flushPromises();
    await photo.get('button').trigger('click');
    await classic.get('button').trigger('click'); await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(photo.find('.mobile-media-share__busy').exists()).toBe(false);
    expect(classic.find('.mobile-media-share__busy').exists()).toBe(false);
  });
  it('shows the busy notice even when two movies are tapped before Vue renders', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    stubFetch(vi.fn(() => new Promise<Response>(() => {})));
    const one = mountButton(true, 'video');
    const two = mountButton(true, 'video');
    (one.get('button').element as HTMLButtonElement).click();
    (two.get('button').element as HTMLButtonElement).click();
    await flushPromises();
    expect(two.find('.mobile-media-share__busy').exists()).toBe(true);
  });
  it('does not let a canceled transfer release the next movie slot', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const finish: ((response: Response) => void)[] = [];
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish.push(resolve); }));
    stubFetch(fetch);
    const one = mountButton(true, 'video');
    const two = mountButton(true, 'video');
    const three = mountButton(true, 'video');
    await one.get('button').trigger('click'); await flushPromises();
    await one.get('.mobile-media-share__popup-actions button').trigger('click');
    await two.get('button').trigger('click'); await flushPromises();
    one.unmount();
    finish[0](new Response('obsolete')); await flushPromises();
    await three.get('button').trigger('click'); await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(three.find('.mobile-media-share__busy').exists()).toBe(true);
  });
  it('releases a prepared video after sharing instead of retaining it in each post', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('video', { headers: { 'Content-Type': 'video/mp4' } })));
    stubFetch(fetch);
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click');
      await flushPromises();
      await wrapper.get('.mobile-media-share__confirm').trigger('click');
      await flushPromises();
      await wrapper.get('button').trigger('click');
      await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(share).toHaveBeenCalledOnce();
      expect(wrapper.find('.mobile-media-share__confirm').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });
  it.each(['iPhone', 'Android'])('blocks a video over 250 MB on %s before downloading its body', async (userAgent) => {
    vi.stubGlobal('navigator', { userAgent, share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { headers: { 'Content-Length': '250000001' } }));
    vi.stubGlobal('fetch', fetch);
    const navigate = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click'); await flushPromises();
      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0][1].method).toBe('HEAD');
      const popup = wrapper.get('.mobile-media-share__blocked');
      expect(popup.text()).toContain('250 MB sharing limit');
      expect(popup.get('a[download]').attributes('href')).toBe('/api/originals/1?download=1');
      expect(navigate).not.toHaveBeenCalled();
      await popup.get('button').trigger('click');
      expect(wrapper.find('.mobile-media-share__blocked').exists()).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    } finally { wrapper.unmount(); }
  });
  it('checks the actual movie format before downloading on Android', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Android', share: vi.fn(), canShare: vi.fn(({ files }) => files[0].type === 'video/mp4') });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { headers: { 'Content-Length': '1000', 'Content-Type': 'video/quicktime', 'Content-Disposition': 'attachment; filename=movie.mov' } }));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click'); await flushPromises();
      expect(fetch).toHaveBeenCalledOnce();
      expect(wrapper.get('.mobile-media-share__blocked').text()).toContain('can’t share this video directly');
    } finally { wrapper.unmount(); }
  });
  it('allows the exact 250 MB boundary after checking HEAD', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    const fetch = vi.fn().mockImplementation((_url, init) => Promise.resolve(init?.method === 'HEAD'
      ? new Response(null, { headers: { 'Content-Length': '250000000' } })
      : new Response('video', { headers: { 'Content-Type': 'video/mp4' } })));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click'); await flushPromises();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][1].method).toBe('HEAD');
      expect(wrapper.find('.mobile-media-share__confirm').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });
  it.each([null, 'invalid', '-1'])('offers Download and Cancel if HEAD size is %s', async (length) => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const fetch = vi.fn().mockResolvedValue(new Response(null, { headers: length === null ? {} : { 'Content-Length': length } }));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click'); await flushPromises();
      expect(fetch).toHaveBeenCalledOnce();
      expect(wrapper.get('.mobile-media-share__blocked').text()).toContain('check this video’s size');
      expect(wrapper.get('.mobile-media-share__blocked button').text()).toBe('Cancel');
    } finally { wrapper.unmount(); }
  });
  it('rejects a GET response that grew after the HEAD check without reading its body', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetch = vi.fn().mockImplementation((_url, init) => Promise.resolve(init?.method === 'HEAD'
      ? new Response(null, { headers: { 'Content-Length': '8' } })
      : new Response(body, { headers: { 'Content-Length': '250000001', 'Content-Type': 'video/mp4' } })));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click'); await flushPromises();
      expect(wrapper.get('.mobile-media-share__blocked').text()).toContain('250 MB sharing limit');
      expect(cancel).toHaveBeenCalledOnce();
    } finally { wrapper.unmount(); }
  });
  it('aborts an untrustworthy stream as soon as actual bytes cross the limit', async () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { stream = controller; }, cancel });
    const fetch = vi.fn().mockImplementation((_url, init) => Promise.resolve(init?.method === 'HEAD'
      ? new Response(null, { headers: { 'Content-Length': '8' } })
      : new Response(body, { headers: { 'Content-Type': 'video/mp4' } })));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountButton(true, 'video');
    try {
      await wrapper.get('button').trigger('click'); await flushPromises();
      // Reuse the buffer to test 250 MB of streamed bytes without allocating 250 MB.
      const chunk = new Uint8Array(10_000_000);
      for (let i = 0; i < 25; i++) stream.enqueue(chunk);
      await flushPromises();
      stream.enqueue(new Uint8Array(1)); await flushPromises();
      expect(wrapper.get('.mobile-media-share__blocked').text()).toContain('250 MB sharing limit');
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
    } finally { wrapper.unmount(); }
  });
  it('falls back to downloading when file sharing is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const wrapper = mountButton();
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.get('a').attributes('href')).toBe('/api/originals/1?download=1');
    expect(wrapper.get('a').attributes('download')).toBeDefined();
  });
});

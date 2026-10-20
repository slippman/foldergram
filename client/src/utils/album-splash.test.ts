import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ResilientImage from '../components/ResilientImage.vue';

const html = readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('attributeFilter'))![1];
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const windowListeners: Array<[string, EventListenerOrEventListenerObject]> = [];
function start() { new Function(script)(); }
function visibleImage() {
  const img = document.querySelector('img')!;
  Object.defineProperty(img, 'complete', { value: false, configurable: true });
  Object.defineProperty(img, 'naturalWidth', { value: 640 });
  vi.spyOn(img, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 200, width: 100 } as DOMRect);
  return img;
}
beforeEach(() => {
  const addListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    windowListeners.push([type, listener]);
    addListener(type, listener, options);
  });
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  document.documentElement.classList.add('album-entry', 'shared-album-entry');
  document.querySelector('meta[name="cinema-viewer-loader-delay-ms"]')?.remove();
  document.body.innerHTML = '<div id="fg-splash"><div class="fg-splash__album"><p>Loading album…</p><span class="fg-splash__indicator"></span><button class="fg-splash__retry" hidden>Retry</button></div></div><div id="app"></div>';
});
afterEach(() => {
  for (const [type, listener] of windowListeners.splice(0)) window.removeEventListener(type, listener);
  document.documentElement.classList.remove('album-entry', 'shared-album-entry');
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('album startup splash', () => {
  it('uses the Reels label and waits for the active poster after queue loading', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="loading" data-album-loading-label="Loading reels"></main>';
    start(); await flush();
    expect(document.querySelector('.fg-splash__album p')?.textContent).toBe('Loading reels');
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    const poster = document.createElement('img');
    Object.defineProperty(poster, 'complete', { value: false, configurable: true });
    Object.defineProperty(poster, 'naturalWidth', { value: 640 });
    vi.stubGlobal('Image', function () { return poster; });
    app.querySelector('main')!.innerHTML = '<div data-album-poster="/active-reel.jpg"></div>';
    app.querySelector('main')!.setAttribute('data-album-state', 'ready');
    await flush();
    expect(poster.getAttribute('src')).toBe('/active-reel.jpg');
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    Object.defineProperty(poster, 'complete', { value: true });
    poster.dispatchEvent(new Event('load')); await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('does not carry a direct Reels entry label into a later album', async () => {
    window.history.replaceState({}, '', '/reels');
    document.querySelector('.fg-splash__album p')!.textContent = 'Loading reels…';
    document.getElementById('app')!.innerHTML = '<main data-album-theme="cinema" data-album-state="settled"></main>';
    try {
      start(); await flush(); await vi.advanceTimersByTimeAsync(340);
      document.getElementById('app')!.innerHTML = '<main data-album-theme="cinema" data-album-state="loading"></main>';
      window.dispatchEvent(new Event('foldergram:album-view-loading'));
      await flush();
      expect(document.querySelector('.fg-splash__album p')?.textContent).toBe('Loading album…');
    } finally { window.history.replaceState({}, '', '/'); }
  });

  it('keeps the email splash until token inspection settles', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<section data-album-theme="cinema" data-album-state="loading">Checking link</section>';
    start(); await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    app.querySelector('section')!.setAttribute('data-album-state', 'settled');
    await flush();
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });

  it('applies the saved email theme before application CSS and marks sign-in as a readiness-gated entry', () => {
    const initial = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    window.history.replaceState({}, '', '/signin#token=test');
    window.localStorage.setItem('foldergram-theme', 'dark');
    document.documentElement.classList.remove('album-entry', 'shared-album-entry');
    new Function(initial)();
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('album-entry')).toBe(true);
    expect(document.documentElement.classList.contains('email-auth-entry')).toBe(true);
    document.documentElement.classList.remove('email-auth-entry');
    delete document.documentElement.dataset.theme;
    window.localStorage.removeItem('foldergram-theme');
    window.history.replaceState({}, '', '/');
  });

  it('keeps the initial UR splash through unknown preferences and post loading', async () => {
    document.documentElement.classList.add('shared-album-entry');
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-theme="unknown" data-album-state="loading"></main>';
    start(); await flush();
    const splash = document.querySelector('#fg-splash');
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.documentElement.classList.contains('shared-album-entry')).toBe(true);
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    const state = app.querySelector('main')!;
    state.setAttribute('data-album-theme', 'cinema');
    await flush();
    expect(document.querySelector('#fg-splash')).toBe(splash);
    state.setAttribute('data-album-state', 'ready');
    await flush();
    expect(document.documentElement.classList.contains('shared-album-entry')).toBe(true);
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });

  it('uses the configured viewer delay', async () => {
    const meta = document.createElement('meta');
    meta.name = 'cinema-viewer-loader-delay-ms';
    meta.content = '500';
    document.head.append(meta);
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="settled"></main>';
    start(); await flush();
    await vi.advanceTimersByTimeAsync(340);
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="loading"></main>';
    window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
    await flush();
    await vi.advanceTimersByTimeAsync(499);
    expect(document.querySelector('.fg-splash--pending')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.fg-splash--pending')).toBeNull();
    expect(document.querySelector('#fg-splash')).not.toBeNull();
  });

  it('never reveals the deferred viewer loader when the next image is ready before 1 second', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="settled"></main>';
    start(); await flush();
    await vi.advanceTimersByTimeAsync(340);
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="loading"></main>';
    const ready = vi.fn();
    window.addEventListener('foldergram:album-ready', ready);
    window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
    await flush();
    expect(document.querySelector('.fg-splash--pending')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(900);
    app.querySelector('main')!.setAttribute('data-album-state', 'ready');
    await flush();
    expect(document.querySelector('#fg-splash')).toBeNull();
    expect(ready).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });

  it('delays one unified viewer loader through fetch and image phases without resetting on duplicate events', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="settled"></main>';
    start(); await flush();
    await vi.advanceTimersByTimeAsync(340);
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="loading"></main>';
    const notify = () => window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
    notify(); await flush();
    const splash = document.querySelector('#fg-splash');
    await vi.advanceTimersByTimeAsync(200);
    notify(); await flush();
    await vi.advanceTimersByTimeAsync(799);
    expect(document.querySelector('.fg-splash--pending')).toBe(splash);
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.fg-splash--pending')).toBeNull();
    expect(document.querySelector('#fg-splash')).toBe(splash);
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="ready"><img src="/next.jpg"></main>';
    const img = visibleImage();
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    Object.defineProperty(img, 'complete', { value: true });
    img.dispatchEvent(new Event('load'));
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBe(splash);
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });

  it('reveals an ordinary folder loader immediately when it replaces a deferred viewer', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="settled"></main>';
    start(); await flush();
    await vi.advanceTimersByTimeAsync(340);
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="loading"></main>';
    window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('.fg-splash--pending')).not.toBeNull();
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    await flush();
    const splash = document.querySelector('#fg-splash');
    expect(splash).not.toBeNull();
    expect(document.querySelector('.fg-splash--pending')).toBeNull();
    expect(document.querySelector('.fg-splash--deferred')).toBeNull();
    await vi.advanceTimersByTimeAsync(1200);
    expect(document.querySelector('#fg-splash')).toBe(splash);
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    app.querySelector('main')!.setAttribute('data-album-state', 'ready');
    await flush();
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });

  it('cancels a pending reveal when leaving the viewer', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="settled"></main>';
    start(); await flush();
    await vi.advanceTimersByTimeAsync(340);
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="loading"></main>';
    window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
    await flush();
    window.dispatchEvent(new Event('foldergram:album-view-cancel'));
    await vi.advanceTimersByTimeAsync(500);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });

  it('keeps the original generic splash for Classic and does not wait on its images', async () => {
    document.documentElement.classList.remove('shared-album-entry');
    document.getElementById('app')!.innerHTML = '<main data-album-theme="classic" data-album-state="loading"><img src="/classic-pending.jpg" loading="lazy"></main>';
    const img = visibleImage();
    start(); await flush();
    expect(document.documentElement.classList.contains('shared-album-entry')).toBe(false);
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
    expect(img.loading).not.toBe('eager');
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });
  it.each(['/f/trip', '/folders/trip', '/share/trip'])('recognizes direct album entry at %s', (pathname) => {
    document.documentElement.classList.remove('album-entry', 'shared-album-entry');
    const entryScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    new Function('window', entryScript)({ location: { pathname } });
    expect(document.documentElement.classList.contains('album-entry')).toBe(true);
    expect(document.documentElement.classList.contains('shared-album-entry')).toBe(false);
  });
  it('stays through intermediate shells, album data loading, and visible thumbnail loading', async () => {
    start();
    const app = document.getElementById('app')!;
    app.innerHTML = '<main>Loading…</main>';
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    app.innerHTML = '<main data-album-state="loading">Opening album…</main>';
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    app.innerHTML = '<main data-album-state="ready"><img src="/sample.png"></main>';
    const img = visibleImage();
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    Object.defineProperty(img, 'complete', { value: true });
    img.dispatchEvent(new Event('load'));
    await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(340);
    expect(document.getElementById('fg-splash')).toBeNull();
    app.innerHTML = '<main data-album-state="ready"><img src="/scroll-preview.png"></main>';
    const preview = visibleImage();
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    await flush();
    expect(document.getElementById('fg-splash')).not.toBeNull();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    Object.defineProperty(preview, 'complete', { value: true });
    preview.dispatchEvent(new Event('load'));
    await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('keeps one loader through modal fetch and image loading', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-theme="cinema" data-album-state="ready">Loaded background album</main><div class="app__image-modal-layer"><section data-album-theme="cinema" data-album-state="loading"></section></div>';
    start(); await flush();
    const splash = document.querySelector('#fg-splash');
    const indicator = document.querySelector('.fg-splash__indicator');
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    // Duplicate navigation/theme notifications must preserve the animation node.
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    await flush();
    expect(document.querySelector('#fg-splash')).toBe(splash);
    expect(document.querySelector('.fg-splash__indicator')).toBe(indicator);
    const state = app.querySelector('.app__image-modal-layer section')!;
    const wrapper = mount(ResilientImage, {
      attachTo: state,
      props: { src: '/large-photo.jpg', alt: '', loading: 'eager', maxRetries: 0 }
    });
    try {
      state.setAttribute('data-album-state', 'ready');
      await flush();
      await vi.advanceTimersByTimeAsync(500);
      expect(document.querySelector('#fg-splash')).toBe(splash);
      expect(document.querySelector('.fg-splash--out')).toBeNull();
      await wrapper.get('img').trigger('load');
      await vi.advanceTimersByTimeAsync(100);
      await flush();
      expect(document.querySelector('#fg-splash')).toBe(splash);
      expect(document.querySelector('.fg-splash--out')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(340);
      expect(document.querySelector('#fg-splash')).toBeNull();
    } finally { wrapper.unmount(); }
  });
  it('loads and waits for offscreen images as well as the opening row', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"><img src="/first.png"><img src="/below-fold.png" loading="lazy"></main>';
    const images = [...document.querySelectorAll('img')];
    for (const img of images) {
      Object.defineProperty(img, 'complete', { value: false, configurable: true });
      Object.defineProperty(img, 'naturalWidth', { value: 640 });
    }
    start(); await flush();
    expect(images[1].loading).toBe('eager');
    Object.defineProperty(images[0], 'complete', { value: true });
    images[0].dispatchEvent(new Event('load'));
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    Object.defineProperty(images[1], 'complete', { value: true });
    images[1].dispatchEvent(new Event('load'));
    await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('restarts a fading splash and prevents the old timer from revealing the next album', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="settled">First album</main>';
    start(); await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
    app.innerHTML = '<main data-album-state="ready"><img src="/next-album.jpg"></main>';
    const img = visibleImage();
    const ready = vi.fn();
    window.addEventListener('foldergram:album-ready', ready);
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    await vi.advanceTimersByTimeAsync(400);
    expect(document.querySelectorAll('#fg-splash')).toHaveLength(1);
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    expect(ready).not.toHaveBeenCalled();
    Object.defineProperty(img, 'complete', { value: true });
    img.dispatchEvent(new Event('load'));
    await flush();
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
    expect(ready).toHaveBeenCalledOnce();
  });
  it.each([true, false])('ignores obsolete queued loading frames with cancellation=%s', async (cancel) => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="loading"></main>';
    start();
    const ready = vi.fn();
    window.addEventListener('foldergram:album-ready', ready);
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    app.innerHTML = '<main data-album-state="settled"></main>';
    if (cancel) window.dispatchEvent(new Event('foldergram:album-view-cancel'));
    while (frames.length) frames.shift()!(0);
    await flush();
    await vi.advanceTimersByTimeAsync(20000);
    expect(document.querySelector('#fg-splash')).toBeNull();
    expect(ready).toHaveBeenCalledOnce();
  });
  it('cancels pending image loading when navigation leaves the album', async () => {
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="ready"><img src="/pending.png"></main>';
    visibleImage();
    start(); await flush();
    expect(document.querySelector('#fg-splash')).not.toBeNull();
    app.innerHTML = '<main>Library</main>';
    window.dispatchEvent(new Event('foldergram:album-view-cancel'));
    await vi.advanceTimersByTimeAsync(20000);
    expect(document.querySelector('#fg-splash')).toBeNull();
    expect(document.documentElement.classList.contains('shared-album-entry')).toBe(false);
    app.innerHTML = '<main data-album-state="settled">Another album</main>';
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    await flush();
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });
  it('keeps the splash and offers retry when an image fails', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"><img src="/bad.png"></main>';
    const img = visibleImage(); start(); await flush();
    img.dispatchEvent(new Event('error')); await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    expect((document.querySelector('.fg-splash__retry') as HTMLButtonElement).hidden).toBe(false);
  });
  it.each([true, false])('waits for resilient recovery with fallback=%s', async (fallback) => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"></main>';
    const wrapper = mount(ResilientImage, {
      attachTo: document.querySelector('main')!,
      props: { src: '/preview.jpg', fallbackSrc: fallback ? '/original.jpg' : null, alt: '', maxRetries: 1, retryDelayMs: 1500 }
    });
    try {
      start(); await flush();
      await wrapper.get('img').trigger('error');
      await vi.advanceTimersByTimeAsync(1600);
      expect(document.querySelector('.fg-splash--out')).toBeNull();
      expect((document.querySelector('.fg-splash__retry') as HTMLButtonElement).hidden).toBe(true);
      expect(wrapper.get('img').attributes('src')).toBe(fallback ? '/original.jpg' : '/preview.jpg?retry=1');
      expect((wrapper.get('img').element as HTMLImageElement).loading).toBe('eager');
      await wrapper.get('img').trigger('load');
      await vi.advanceTimersByTimeAsync(100);
      expect(document.querySelector('.fg-splash--out')).not.toBeNull();
    } finally { wrapper.unmount(); }
  });
  it('offers retry when resilient recovery is exhausted', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"></main>';
    const wrapper = mount(ResilientImage, {
      attachTo: document.querySelector('main')!,
      props: { src: '/broken.jpg', alt: '', maxRetries: 0 }
    });
    try {
      start(); await flush();
      await wrapper.get('img').trigger('error');
      await vi.advanceTimersByTimeAsync(100);
      expect(document.querySelector('.fg-splash--out')).toBeNull();
      expect((document.querySelector('.fg-splash__retry') as HTMLButtonElement).hidden).toBe(false);
    } finally { wrapper.unmount(); }
  });
  it('waits for a video poster even when the viewer has no img element', async () => {
    const poster = document.createElement('img');
    Object.defineProperty(poster, 'complete', { value: false, configurable: true });
    Object.defineProperty(poster, 'naturalWidth', { value: 640 });
    vi.stubGlobal('Image', function () { return poster; });
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"><video data-album-poster="/video-poster.jpg"></video></main>';
    start(); await flush();
    expect(poster.getAttribute('src')).toBe('/video-poster.jpg');
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    Object.defineProperty(poster, 'complete', { value: true });
    poster.dispatchEvent(new Event('load'));
    await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('replaces obsolete poster waits when switching albums or shared posts mid-load', async () => {
    const posters: HTMLImageElement[] = [];
    vi.stubGlobal('Image', function () {
      const img = document.createElement('img');
      Object.defineProperty(img, 'complete', { value: false, configurable: true });
      Object.defineProperty(img, 'naturalWidth', { value: 640 });
      posters.push(img);
      return img;
    });
    const app = document.getElementById('app')!;
    app.innerHTML = '<main data-album-state="ready"><video data-album-poster="/old.jpg"></video></main>';
    start(); await flush();
    app.innerHTML = '<main data-album-state="ready"><video data-album-poster="/new.jpg"></video></main>';
    window.dispatchEvent(new Event('foldergram:album-view-loading'));
    await flush();
    posters[0].dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(400);
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    expect((document.querySelector('.fg-splash__retry') as HTMLButtonElement).hidden).toBe(true);
    expect(posters[1].getAttribute('src')).toBe('/new.jpg');
    Object.defineProperty(posters[1], 'complete', { value: true });
    posters[1].dispatchEvent(new Event('load'));
    await flush();
    await vi.advanceTimersByTimeAsync(340);
    expect(document.querySelector('#fg-splash')).toBeNull();
  });
  it('does not block on a pending decode promise after a cached image has loaded', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"><img src="/cached.png"></main>';
    const img = document.querySelector('img')!;
    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 640 });
    img.decode = vi.fn(() => new Promise(() => {}));
    start(); await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('detects completion even without a fresh load event on rapid cached reloads', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"><img src="/cached.png"></main>';
    const img = visibleImage(); start(); await flush();
    Object.defineProperty(img, 'complete', { value: true });
    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('dismisses when a resilient thumbnail is cached without a fresh load event', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"></main>';
    const wrapper = mount(ResilientImage, {
      attachTo: document.querySelector('main')!,
      props: { src: '/cached-thumbnail.webp', alt: '' }
    });
    try {
      await flush();
      const image = wrapper.get('img').element;
      Object.defineProperty(image, 'complete', { value: true });
      Object.defineProperty(image, 'naturalWidth', { value: 640 });
      start(); await flush();
      await vi.advanceTimersByTimeAsync(200);
      expect(document.querySelector('.fg-splash--out')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(340);
      expect(document.querySelector('#fg-splash')).toBeNull();
    } finally { wrapper.unmount(); }
  });
  it('dismisses for a settled password or error screen', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="settled">Enter password</main>';
    start();
    await flush();
    expect(document.querySelector('.fg-splash--out')).not.toBeNull();
  });
  it('offers retry without revealing missing images when a thumbnail never finishes', async () => {
    document.getElementById('app')!.innerHTML = '<main data-album-state="ready"><img src="/slow.png"></main>';
    visibleImage();
    start();
    await flush();
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    await vi.advanceTimersByTimeAsync(20000);
    expect(document.querySelector('.fg-splash--out')).toBeNull();
    expect((document.querySelector('.fg-splash__retry') as HTMLButtonElement).hidden).toBe(false);
  });
});

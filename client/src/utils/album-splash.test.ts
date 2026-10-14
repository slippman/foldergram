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
  document.documentElement.classList.add('shared-album-entry');
  document.body.innerHTML = '<div id="fg-splash"><div class="fg-splash__album"><p>Loading album…</p><span class="fg-splash__indicator"></span><button class="fg-splash__retry" hidden>Retry</button></div></div><div id="app"></div>';
});
afterEach(() => {
  for (const [type, listener] of windowListeners.splice(0)) window.removeEventListener(type, listener);
  document.documentElement.classList.remove('shared-album-entry');
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('album startup splash', () => {
  it.each(['/f/trip', '/folders/trip', '/share/trip'])('recognizes direct album entry at %s', (pathname) => {
    document.documentElement.classList.remove('shared-album-entry');
    const entryScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    new Function('window', entryScript)({ location: { pathname } });
    expect(document.documentElement.classList.contains('shared-album-entry')).toBe(true);
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

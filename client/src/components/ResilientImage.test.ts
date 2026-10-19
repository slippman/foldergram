import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import ResilientImage from './ResilientImage.vue';

describe('ResilientImage', () => {
  it('recognizes cached completion without a load event and stops polling', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ResilientImage, { props: { src: '/cached.webp', alt: '', showLoading: true } });
    try {
      await nextTick();
      const image = wrapper.get('img').element as HTMLImageElement;
      Object.defineProperty(image, 'complete', { value: true, configurable: true });
      Object.defineProperty(image, 'naturalWidth', { value: 640, configurable: true });
      await vi.advanceTimersByTimeAsync(100);
      expect(wrapper.get('[data-album-image-state]').attributes('data-album-image-state')).toBe('ready');
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      Object.defineProperty(image, 'complete', { value: false });
      Object.defineProperty(image, 'naturalWidth', { value: 0 });
      await wrapper.setProps({ src: '/pending.webp' });
      await vi.advanceTimersByTimeAsync(100);
      expect(wrapper.get('[data-album-image-state]').attributes('data-album-image-state')).toBe('loading');
      expect(vi.getTimerCount()).toBe(1);
    } finally {
      wrapper.unmount();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });
  it('does not mistake a completed broken image for a loaded image', async () => {
    vi.useFakeTimers();
    const wrapper = mount(ResilientImage, { props: { src: '/broken.webp', alt: '', maxRetries: 0 } });
    try {
      await nextTick();
      const image = wrapper.get('img').element as HTMLImageElement;
      Object.defineProperty(image, 'complete', { value: true });
      Object.defineProperty(image, 'naturalWidth', { value: 0 });
      await vi.advanceTimersByTimeAsync(200);
      expect(wrapper.get('[data-album-image-state]').attributes('data-album-image-state')).toBe('loading');
      await wrapper.get('img').trigger('error');
      expect(wrapper.get('[data-album-image-state]').attributes('data-album-image-state')).toBe('error');
      expect(vi.getTimerCount()).toBe(0);
    } finally { wrapper.unmount(); vi.useRealTimers(); }
  });
  it('shows loading until the photo arrives and restores it for another photo', async () => {
    const wrapper = mount(ResilientImage, {
      props: { src: '/photo.webp', alt: '', showLoading: true, maxRetries: 0 },
      attrs: { class: 'photo' }
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Loading image…');
    expect(wrapper.get('img').classes()).toContain('photo');
    await wrapper.get('img').trigger('load');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await wrapper.setProps({ src: '/another.webp' });
    expect(wrapper.get('[role="status"]').text()).toBe('Loading image…');
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('[role="status"]').text()).toBe('Unable to load image');
    wrapper.unmount();
  });
  it('falls back to the original source when the preview source fails', async () => {
    const wrapper = mount(ResilientImage, {
      props: {
        src: '/previews/NaturePlanet/pexels-photo-2770371.webp',
        fallbackSrc: '/api/originals/2770371',
        alt: 'NaturePlanet preview',
        loading: 'eager'
      }
    });

    expect(wrapper.get('img').attributes('src')).toContain('/previews/NaturePlanet/pexels-photo-2770371.webp');

    await wrapper.get('img').trigger('error');
    await nextTick();

    expect(wrapper.get('img').attributes('src')).toContain('/api/originals/2770371');
    wrapper.unmount();
  });
});

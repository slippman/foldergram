import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MediaPlayerElement } from 'vidstack/elements';
import CinemaVideoStatus from './CinemaVideoStatus.vue';

afterEach(() => { vi.useRealTimers(); });

function setup(autoplay = false) {
  vi.useFakeTimers();
  const player = Object.assign(document.createElement('div'), {
    paused: true, play: vi.fn().mockResolvedValue(undefined), startLoading: vi.fn()
  });
  const wrapper = mount(CinemaVideoStatus, { props: { player: player as unknown as MediaPlayerElement, source: '/movie.mp4', poster: '/poster.jpg', autoplay } });
  async function event(name: string) {
    player.dispatchEvent(new Event(name));
    await wrapper.vm.$nextTick();
  }
  return { wrapper, player, event };
}

describe('Cinema video loading feedback', () => {
  it('indicates pending autoplay even if the load-start event preceded mounting', async () => {
    const { wrapper, player } = setup(true);
    await vi.advanceTimersByTimeAsync(300);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(player.play).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows a play control before playback, and avoids a spinner for fast starts', async () => {
    const { wrapper, player, event } = setup();
    await event('load-start');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(player.play).not.toHaveBeenCalled();
    await wrapper.get('.cinema-video-status__play').trigger('click');
    expect(player.play).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(200);
    await event('playing');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('.cinema-video-poster').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the poster during autoplay loading and the last frame during later buffering', async () => {
    const { wrapper, event } = setup(true);
    await event('load-start');
    await vi.advanceTimersByTimeAsync(299);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('.cinema-video-poster').exists()).toBe(true);
    await event('playing');
    await event('waiting');
    await vi.advanceTimersByTimeAsync(300);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.find('.cinema-video-poster').exists()).toBe(false);
    await event('playing');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each(['pause', 'auto-play-fail', 'ended'])('cancels pending indicators on %s', async (name) => {
    const { wrapper, event } = setup(true);
    await event('load-start');
    await event(name);
    await event('waiting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('.cinema-video-status__retry').exists()).toBe(false);
    wrapper.unmount();
  });

  it('offers retry on a media failure and requests playback again', async () => {
    const { wrapper, player, event } = setup(true);
    const video = document.createElement('video');
    video.load = vi.fn();
    player.append(video);
    await event('load-start');
    await event('error');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await wrapper.get('.cinema-video-status__retry').trigger('click');
    expect(video.load).toHaveBeenCalledOnce();
    expect(player.startLoading).toHaveBeenCalledOnce();
    expect(player.play).toHaveBeenCalledOnce();
    await event('playing');
    expect(wrapper.find('.cinema-video-status__retry').exists()).toBe(false);
    wrapper.unmount();
  });

  it('leaves manual play available when the browser blocks playback', async () => {
    const { wrapper, player } = setup();
    player.play.mockRejectedValue(new DOMException('Gesture required', 'NotAllowedError'));
    await wrapper.get('.cinema-video-status__play').trigger('click');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('.cinema-video-status__retry').exists()).toBe(false);
    expect(wrapper.find('.cinema-video-status__play').exists()).toBe(true);
    wrapper.unmount();
  });

  it('clears stale timers on source changes, visibility changes and unmount', async () => {
    const { wrapper, event } = setup(true);
    await event('load-start');
    await wrapper.setProps({ source: '/next.mp4', poster: '/next.jpg' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.get('.cinema-video-poster').attributes('src')).toBe('/next.jpg');
    await event('load-start');
    await wrapper.setProps({ autoplay: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await event('play');
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

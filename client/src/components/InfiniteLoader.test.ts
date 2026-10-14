import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import InfiniteLoader from './InfiniteLoader.vue';

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  callback: IntersectionObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean) {
    this.callback(
      [
        {
          isIntersecting
        } as IntersectionObserverEntry
      ],
      this as unknown as IntersectionObserver
    );
  }
}

describe('InfiniteLoader', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  it('can hide the end message while preserving loading and pagination', async () => {
    const wrapper = mount(InfiniteLoader, { props: { loading: false, hasMore: false, showComplete: false } });
    expect(wrapper.text()).not.toContain('You are caught up');
    await wrapper.setProps({ showComplete: true });
    expect(wrapper.text()).toContain('You are caught up');
    await wrapper.setProps({ showComplete: false, hasMore: true });
    expect(wrapper.find('button').exists()).toBe(true);
    await wrapper.setProps({ loading: true });
    expect(wrapper.text()).toContain('Loading more');
  });

  it('waits for initial image readiness before requesting another page', () => {
    const splash = document.createElement('div'); splash.id = 'fg-splash'; document.body.append(splash);
    const wrapper = mount(InfiniteLoader, { props: { loading: false, hasMore: true } });
    MockIntersectionObserver.instances[0].trigger(true);
    expect(wrapper.emitted('load-more')).toBeUndefined();
    splash.remove(); window.dispatchEvent(new Event('foldergram:album-ready'));
    expect(wrapper.emitted('load-more')).toHaveLength(1);
    wrapper.unmount();
  });
  it('hides the manual button when button fallback is disabled', () => {
    const wrapper = mount(InfiniteLoader, {
      props: {
        loading: false,
        hasMore: true,
        buttonFallback: false
      }
    });

    expect(wrapper.text()).not.toContain('Load more');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('keeps auto-loading while the sentinel remains visible', async () => {
    const wrapper = mount(InfiniteLoader, {
      props: {
        loading: false,
        hasMore: true,
        buttonFallback: false
      }
    });

    const observer = MockIntersectionObserver.instances[0];
    expect(observer).toBeDefined();

    observer.trigger(true);
    expect(wrapper.emitted('load-more')).toHaveLength(1);

    await wrapper.setProps({
      loading: true
    });
    await wrapper.setProps({
      loading: false
    });

    expect(wrapper.emitted('load-more')).toHaveLength(2);
  });
});

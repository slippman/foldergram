import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import CinemaGuestTeaser from './CinemaGuestTeaser.vue';
import { useAuthStore } from '../stores/auth';

function render() {
  return mount(CinemaGuestTeaser, { global: { stubs: {
    RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' }
  } } });
}

describe('Cinema guest album teaser', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().$patch({ ready: true, enabled: true, authenticated: false, accessMode: 'email' });
  });
  it('invites a guest into the existing sign-in flow', () => {
    const wrapper = render();
    expect(wrapper.get('h2').text()).toBe('There’s more to the story.');
    expect(wrapper.get('a').text()).toBe('Sign in to see more!');
    expect(wrapper.get('a').attributes('href')).toBe('/signin');
    wrapper.unmount();
  });
  it.each([
    { authenticated: true }, { ready: false }, { enabled: false }, { accessMode: 'password' as const }
  ])('does not advertise sign-in for %j', state => {
    useAuthStore().$patch(state);
    const wrapper = render();
    expect(wrapper.find('aside').exists()).toBe(false);
    wrapper.unmount();
  });
});

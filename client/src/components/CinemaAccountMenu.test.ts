import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth';
import CinemaAccountMenu from './CinemaAccountMenu.vue';
import AccountIdentity from './AccountIdentity.vue';
beforeEach(() => setActivePinia(createPinia()));
function signedIn() {
  const auth = useAuthStore();
  auth.enabled = true; auth.authenticated = true; auth.accessMode = 'email';
  auth.user = { id: 7, displayName: 'Seth Lippman', email: 'seth@example.com' };
  return auth;
}
describe('Cinema account menu', () => {
  it('shows the current identity, handles Escape and outside dismissal, and signs out', async () => {
    const auth = signedIn(); const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined);
    const wrapper = mount(CinemaAccountMenu, { attachTo: document.body });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Account: Seth Lippman');
    expect(wrapper.get('.cinema-account__avatar').text()).toBe('SL');
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(wrapper.get('[role=dialog]').text()).toContain('seth@example.com');
    await wrapper.get('[role=dialog]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role=dialog]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); await flushPromises();
    expect(wrapper.find('[role=dialog]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    await wrapper.get('.cinema-account__sign-out').trigger('click'); await flushPromises();
    expect(logout).toHaveBeenCalledOnce(); wrapper.unmount();
  });
  it('offers sign-in to email-mode guests without exposing a prior identity', async () => {
    const auth = signedIn(); auth.authenticated = false; auth.user = null;
    const wrapper = mount(CinemaAccountMenu, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
    expect(wrapper.get('a').attributes('href')).toBe('/signin');
    expect(wrapper.text()).toBe('Sign in'); wrapper.unmount();
  });
  it('shows the email username without its domain when screen names are disabled', async () => {
    const auth = signedIn(); auth.user!.displayName = 'seth_lippman'; auth.user!.email = 'seth_lippman@me.com';
    const wrapper = mount(CinemaAccountMenu);
    expect(wrapper.get('.cinema-account__name').text()).toBe('seth_lippman');
    await wrapper.get('button').trigger('click');
    const identity = wrapper.get('.account-identity');
    expect(identity.get('strong').text()).toBe('seth_lippman');
    expect(identity.find('.account-identity__details > span').exists()).toBe(false);
    wrapper.unmount();
  });
  it('does not add account controls when authentication is disabled', () => {
    const auth = useAuthStore(); auth.enabled = false;
    const wrapper = mount(CinemaAccountMenu); expect(wrapper.find('button').exists()).toBe(false); wrapper.unmount();
  });
  it('closes on an account change and never retains the old email', async () => {
    const auth = signedIn(); const wrapper = mount(CinemaAccountMenu);
    await wrapper.get('button').trigger('click');
    auth.user = { id: 8, displayName: 'Another Person', email: 'other@example.com' }; await flushPromises();
    expect(wrapper.find('[role=dialog]').exists()).toBe(false);
    await wrapper.get('button').trigger('click');
    expect(wrapper.text()).not.toContain('seth@example.com'); expect(wrapper.text()).toContain('other@example.com'); wrapper.unmount();
  });
  it('labels administrator sessions without inventing an email address', () => {
    const auth = signedIn(); auth.user = null;
    const wrapper = mount(AccountIdentity); expect(wrapper.text()).toContain('Administrator');
    expect(wrapper.text()).not.toContain('@'); wrapper.unmount();
  });
});

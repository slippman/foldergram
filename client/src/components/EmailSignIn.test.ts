import { reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailSignIn from './EmailSignIn.vue';
import { useAuthStore } from '../stores/auth';
const mocks = vi.hoisted(() => ({ request: vi.fn(), inspect: vi.fn(), confirm: vi.fn(), inviteInspect: vi.fn(), inviteAccept: vi.fn(), replace: vi.fn().mockResolvedValue(undefined), route: { hash: '', query: {} as Record<string, string> } }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('../api/email-auth', () => ({ inspectEmailInvitation: mocks.inviteInspect, acceptEmailInvitation: mocks.inviteAccept, requestEmailSignIn: mocks.request, inspectEmailSignIn: mocks.inspect, confirmEmailSignIn: mocks.confirm }));

describe('email sign-in confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks(); setActivePinia(createPinia()); mocks.route = reactive({ hash: '', query: {} });
    mocks.replace.mockImplementation(async (path: string) => { mocks.route.query = path.includes('sent=1') ? { sent: '1' } : {}; });
    window.history.replaceState({}, '', '/signin');
    mocks.request.mockResolvedValue({ message: 'generic' });
    mocks.inspect.mockResolvedValue({ email: 'family@example.com', displayName: 'Family' });
    mocks.confirm.mockResolvedValue({ ok: true });
  });
  it('never paints the request form while a link inspection is pending', async () => {
    const token = 'a'.repeat(43);
    window.history.replaceState({}, '', `/signin#token=${token}`);
    let finish!: (identity: any) => void;
    mocks.inspect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(EmailSignIn);
    expect(wrapper.attributes('data-album-state')).toBe('loading');
    expect(wrapper.find('input[type=email]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Access to UnReeled Photos requires');
    await flushPromises();
    expect(wrapper.attributes('data-album-state')).toBe('loading');
    expect(mocks.confirm).not.toHaveBeenCalled();
    finish({ email: 'family@example.com', firstSignIn: false });
    await flushPromises();
    expect(wrapper.attributes('data-album-state')).toBe('settled');
    expect(wrapper.text()).toContain('Sign in as family@example.com?');
    expect(wrapper.find('input[type=email]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('offers an optional first-sign-in screen name and submits it only with verification', async () => {
    window.history.replaceState({}, '', `/signin#token=${'a'.repeat(43)}`);
    mocks.inspect.mockResolvedValue({ email: 'family@example.com', displayName: 'Family', firstSignIn: true });
    vi.spyOn(useAuthStore(), 'initialize').mockResolvedValue(undefined);
    const wrapper = mount(EmailSignIn); await flushPromises();
    expect(wrapper.text()).toContain('Screen name (optional)');
    expect(wrapper.text()).toContain('not your email');
    expect(wrapper.get('#screen-name').attributes('autocomplete')).toBe('nickname');
    await wrapper.get('#screen-name').setValue('Friendly Photographer');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith('a'.repeat(43), 'Friendly Photographer');
    wrapper.unmount();
  });
  it('scrubs an invitation, waits for a click and requests email without signing the visitor in', async () => {
    const token = 'i'.repeat(43);
    window.history.replaceState({}, '', `/signin#invite=${token}`);
    mocks.inviteInspect.mockImplementation(async () => {
      expect(window.location.hash).toBe(''); return { email: 'invitee@example.com' };
    });
    mocks.inviteAccept.mockResolvedValue({ ok: true });
    const initialize = vi.spyOn(useAuthStore(), 'initialize').mockResolvedValue(undefined);
    const wrapper = mount(EmailSignIn); await flushPromises();
    expect(wrapper.text()).toContain('invitee@example.com');
    expect(wrapper.find('#screen-name').exists()).toBe(false);
    expect(mocks.inviteAccept).not.toHaveBeenCalled();
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.inviteAccept).toHaveBeenCalledWith(token);
    expect(wrapper.find('[role=dialog]').exists()).toBe(true);
    expect(initialize).not.toHaveBeenCalled(); expect(mocks.confirm).not.toHaveBeenCalled();
    expect(wrapper.html()).not.toContain(token); wrapper.unmount();
  });
  it('skips the screen-name step when the server disables it for the current phase', async () => {
    const token = 'a'.repeat(43);
    window.history.replaceState({}, '', `/signin#token=${token}`);
    mocks.inspect.mockResolvedValue({ email: 'family@example.com', displayName: 'Family', firstSignIn: false });
    vi.spyOn(useAuthStore(), 'initialize').mockResolvedValue(undefined);
    const wrapper = mount(EmailSignIn); await flushPromises();
    expect(wrapper.find('#screen-name').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Future features');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith(token);
    wrapper.unmount();
  });
  it('scrubs the fragment before inspection and waits for explicit account confirmation', async () => {
    const token = 'a'.repeat(43);
    window.history.replaceState({}, '', `/signin#token=${token}`);
    mocks.inspect.mockImplementation(async () => {
      expect(window.location.hash).toBe('');
      return { email: 'family@example.com', displayName: 'Family' };
    });
    const auth = useAuthStore(); const initialize = vi.spyOn(auth, 'initialize').mockResolvedValue(undefined);
    const wrapper = mount(EmailSignIn);
    await flushPromises();
    expect(mocks.inspect).toHaveBeenCalledWith(token);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('family@example.com');
    expect(wrapper.text()).not.toContain('Confirm your email address');
    expect(wrapper.get('form button[type=submit]').text()).toBe("Yep, that's me!");
    expect(wrapper.text()).not.toContain('Enter your email address');
    expect(wrapper.html()).not.toContain(token);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith(token);
    expect(initialize).toHaveBeenCalledWith(true);
    expect(mocks.replace).toHaveBeenLastCalledWith('/');
    wrapper.unmount();
  });
  it('checks a link opened as a fragment change in an already open sign-in tab', async () => {
    const wrapper = mount(EmailSignIn); await flushPromises();
    const token = 'b'.repeat(43);
    window.history.replaceState({}, '', `/signin#token=${token}`);
    mocks.route.hash = `#token=${token}`;
    await flushPromises();
    expect(mocks.inspect).toHaveBeenCalledWith(token);
    expect(window.location.hash).toBe('');
    expect(wrapper.text()).toContain('family@example.com');
    expect(mocks.confirm).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('requests email and shows the same generic notice without rendering returned account information', async () => {
    const wrapper = mount(EmailSignIn); await flushPromises();
    await wrapper.get('input[type=email]').setValue('family@example.com');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.request).toHaveBeenCalledWith('family@example.com');
    expect(wrapper.get('[role=dialog]').text()).toContain('Check your inbox');
    await wrapper.get('[role=dialog] button').trigger('click'); await flushPromises();
    expect(mocks.replace).toHaveBeenLastCalledWith('/signin?sent=1');
    expect(wrapper.find('[role=dialog]').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.text()).toContain('You can close this page.');
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await wrapper.get('button').trigger('click'); await flushPromises();
    expect(mocks.replace).toHaveBeenLastCalledWith('/signin');
    expect(wrapper.get('input[type=email]').element.value).toBe('');
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('preserves the waiting page on reload without sending another email', async () => {
    window.history.replaceState({}, '', '/signin?sent=1'); mocks.route.query = { sent: '1' };
    const wrapper = mount(EmailSignIn); await flushPromises();
    expect(wrapper.find('input[type=email]').exists()).toBe(false);
    expect(wrapper.text()).toContain('You can close this page.');
    expect(mocks.request).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it('shows an error instead of the inbox popup when the request fails', async () => {
    mocks.request.mockRejectedValue(new Error('Unable to send right now.'));
    const wrapper = mount(EmailSignIn); await flushPromises();
    await wrapper.get('input[type=email]').setValue('family@example.com');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('Unable to send right now.');
    expect(wrapper.find('[role=dialog]').exists()).toBe(false); wrapper.unmount();
  });
  it('allows requesting a fresh link after expiry without consuming an invalid token', async () => {
    window.history.replaceState({}, '', `/signin#token=${'a'.repeat(43)}`);
    mocks.inspect.mockRejectedValue(new Error('expired'));
    const wrapper = mount(EmailSignIn); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('invalid or expired');
    expect(wrapper.find('input[type=email]').exists()).toBe(true);
    expect(mocks.confirm).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('does not advertise administrator access', async () => {
    const wrapper = mount(EmailSignIn); await flushPromises();
    expect(wrapper.text()).not.toContain('Admin sign-in');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    expect(wrapper.find('a[href="/admin"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

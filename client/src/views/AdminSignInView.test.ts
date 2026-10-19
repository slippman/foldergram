import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSignInView from './AdminSignInView.vue';
import { useAuthStore } from '../stores/auth';
const { replace } = vi.hoisted(() => ({ replace: vi.fn().mockResolvedValue(undefined) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  setActivePinia(createPinia()); replace.mockClear();
  const auth = useAuthStore();
  auth.ready = true; auth.enabled = true; auth.authenticated = false; auth.role = 'anonymous'; auth.accessMode = 'email';
  auth.capabilities.canAccessSettings = false;
});

describe('dedicated admin sign-in', () => {
  it('uses admin-only authentication and enters settings after successful authentication', async () => {
    const auth = useAuthStore();
    const unlock = vi.spyOn(auth, 'unlockAdmin').mockImplementation(async () => {
      auth.authenticated = true; auth.role = 'admin'; auth.capabilities.canAccessSettings = true;
    });
    const login = vi.spyOn(auth, 'login');
    const wrapper = mount(AdminSignInView);
    await wrapper.get('input[type=password]').setValue('admin-test-password');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(unlock).toHaveBeenCalledWith('admin-test-password');
    expect(login).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/settings');
    wrapper.unmount();
  });
  it('keeps failed authentication on the password form', async () => {
    vi.spyOn(useAuthStore(), 'unlockAdmin').mockRejectedValue(new Error('Incorrect admin password.'));
    const wrapper = mount(AdminSignInView);
    await wrapper.get('input[type=password]').setValue('wrong-password');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.text()).toContain('Incorrect admin password.');
    expect(replace).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('does not advertise elevation controls to email visitors', () => {
    const auth = useAuthStore();
    expect(auth.canUnlockAdmin).toBe(false);
    auth.accessMode = 'password';
    expect(auth.canUnlockAdmin).toBe(true);
  });
});

import { flushPromises, shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth';
import { usePlacesStore } from '../stores/places';
import SidebarNav from './SidebarNav.vue';
import TopNav from './TopNav.vue';
vi.mock('vue-router', async () => ({
  ...await vi.importActual<typeof import('vue-router')>('vue-router'),
  useRoute: () => ({ name: 'home', fullPath: '/', path: '/', params: {}, query: {} })
}));
beforeEach(() => {
  setActivePinia(createPinia());
  const auth = useAuthStore(); auth.enabled = true; auth.authenticated = true;
  auth.user = { id: 7, displayName: 'Seth Lippman', email: 'seth@example.com' };
  vi.spyOn(usePlacesStore(), 'fetchPlaces').mockResolvedValue(undefined);
});
describe.each([['sidebar', SidebarNav], ['mobile navigation', TopNav]] as const)('%s identity', (_name, component) => {
  it.each([true, false])('shows identity only with Cinema enabled (%s)', async (cinema) => {
    const wrapper = shallowMount(component, { props: { expanded: true, cinema }, global: { stubs: { AccountIdentity: false } } });
    await wrapper.get('button[aria-haspopup=menu]').trigger('click'); await flushPromises();
    expect(wrapper.text().includes('seth@example.com')).toBe(cinema);
    expect(wrapper.find('.account-identity').exists()).toBe(cinema);
    wrapper.unmount();
  });
});

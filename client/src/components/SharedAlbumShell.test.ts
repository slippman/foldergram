import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { defineComponent, nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SharedAlbumShell from './SharedAlbumShell.vue';
import AppShell from './AppShell.vue';
import { useAppStore } from '../stores/app';

const route = vi.hoisted(() => ({ name: 'shared-folder', params: { slug: 'trip' }, meta: {} }));
import { useAuthStore } from '../stores/auth';

vi.mock('vue-router', async () => ({
  ...await vi.importActual('vue-router'),
  useRoute: () => route
}));
beforeEach(() => {
  setActivePinia(createPinia());
  route.name = 'shared-folder';
  const auth = useAuthStore();
  auth.ready = true; auth.enabled = true; auth.authenticated = true; auth.role = 'viewer';
});
function render(cinema = true) {
  return mount(SharedAlbumShell, {
    props: { cinema },
    slots: { default: '<div data-test="shared-content">Scoped album content</div>' },
    global: { stubs: { SidebarNav: true, TopNav: true } }
  });
}
describe('shared album navigation', () => {
  it.each(['cinema', 'classic'] as const)('keeps the normal album shell theme when no override is supplied: %s', theme => {
    route.name = 'folder';
    vi.spyOn(useAppStore(), 'folderDisplayTheme', 'get').mockReturnValue(theme);
    const wrapper = mount(AppShell, { global: { stubs: { SidebarNav: true, TopNav: true } } });
    expect(wrapper.get('.app-shell').classes().includes('app-shell--cinema')).toBe(theme === 'cinema');
    wrapper.unmount();
  });
  it('shows Cinema desktop and mobile navigation for a signed-in viewer without replacing scoped album content', () => {
    const wrapper = render();
    expect(wrapper.find('sidebar-nav-stub').exists()).toBe(true);
    expect(wrapper.find('top-nav-stub').exists()).toBe(true);
    expect(wrapper.get('.app-shell').classes()).toContain('app-shell--cinema');
    expect(wrapper.get('[data-test="shared-content"]').text()).toBe('Scoped album content');
    wrapper.unmount();
  });
  it.each(['guest', 'not-ready', 'anonymous', 'auth-off', 'classic'] as const)('preserves standalone presentation for %s', mode => {
    const auth = useAuthStore();
    if (mode === 'guest') auth.authenticated = false;
    if (mode === 'not-ready') auth.ready = false;
    if (mode === 'anonymous') auth.role = 'anonymous';
    if (mode === 'auth-off') auth.enabled = false;
    const wrapper = render(mode !== 'classic');
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.find('[data-test="shared-content"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it('does not remount the album when its theme arrives or the user signs out', async () => {
    const mounted = vi.fn();
    const Content = defineComponent({ setup() { mounted(); }, template: '<div>Album</div>' });
    const wrapper = mount(SharedAlbumShell, { props: { cinema: false }, slots: { default: Content }, global: { stubs: { SidebarNav: true, TopNav: true } } });
    await wrapper.setProps({ cinema: true });
    useAuthStore().authenticated = false;
    await nextTick();
    expect(mounted).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('removes navigation after sign-out while retaining the shared album', async () => {
    const wrapper = render();
    useAuthStore().authenticated = false;
    await nextTick();
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.find('[data-test="shared-content"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

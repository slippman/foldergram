import { defineComponent, reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth';
import { useSharedAlbumRedirect } from './useSharedAlbumRedirect';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), fetchFolder: vi.fn(), route: {} as any }));
vi.mock('vue-router', async () => ({ ...await vi.importActual('vue-router'), useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('../api/gallery', () => ({ fetchFolder: (...args: unknown[]) => mocks.fetchFolder(...args) }));

const Harness = defineComponent({ setup() { return { pending: useSharedAlbumRedirect() }; }, template: '<span>{{ pending }}</span>' });
beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  mocks.route = reactive({ name: 'shared-folder', fullPath: '/share/trip#token=private', params: { slug: 'trip' }, query: {} as any });
  mocks.fetchFolder.mockResolvedValue({ slug: 'trip' });
  const auth = useAuthStore();
  auth.ready = true; auth.enabled = true; auth.authenticated = true; auth.role = 'viewer'; auth.accessMode = 'email';
  auth.user = { id: 7, displayName: 'family', email: 'family@example.com' };
});

describe('signed-in shared album entry', () => {
  it('verifies normal album access and preserves scroll/photo without copying share credentials or return URLs', async () => {
    mocks.route.query = { view: 'scroll', photo: '42', token: 'private', returnTo: 'https://elsewhere.example' };
    const wrapper = mount(Harness);
    expect(wrapper.text()).toBe('true');
    await flushPromises();
    expect(mocks.fetchFolder).toHaveBeenCalledWith('trip');
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith({ name: 'folder', params: { slug: 'trip' }, query: { view: 'scroll', photo: '42' } });
    expect(wrapper.text()).toBe('false'); wrapper.unmount();
  });
  it('waits for initial authentication before deciding whether to jump', async () => {
    const auth = useAuthStore(); auth.ready = false;
    const wrapper = mount(Harness);
    expect(mocks.fetchFolder).not.toHaveBeenCalled();
    auth.ready = true; await flushPromises();
    expect(mocks.replace).toHaveBeenCalledOnce(); wrapper.unmount();
  });
  it.each(['guest', 'public', 'disabled', 'unrelated-route'] as const)('keeps %s entry unchanged without probing protected albums', async mode => {
    const auth = useAuthStore();
    if (mode === 'guest') { auth.authenticated = false; auth.role = 'anonymous'; auth.user = null; }
    if (mode === 'public') { auth.authenticated = false; auth.accessMode = 'public'; }
    if (mode === 'disabled') auth.enabled = false;
    if (mode === 'unrelated-route') mocks.route.name = 'shared-post';
    const wrapper = mount(Harness); await flushPromises();
    expect(mocks.fetchFolder).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('keeps the share flow available when normal album access is denied or the session expired', async () => {
    mocks.fetchFolder.mockRejectedValue(new Error('Forbidden'));
    const wrapper = mount(Harness); await flushPromises();
    expect(mocks.replace).not.toHaveBeenCalled(); expect(wrapper.text()).toBe('false'); wrapper.unmount();
  });
  it.each(['navigation', 'sign-out', 'account-switch', 'unmount'] as const)('discards an old access check after %s', async change => {
    let finish!: (folder: { slug: string }) => void;
    mocks.fetchFolder.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const wrapper = mount(Harness);
    if (change === 'navigation') { mocks.route.name = 'home'; mocks.route.fullPath = '/'; }
    if (change === 'sign-out') useAuthStore().authenticated = false;
    if (change === 'account-switch') { useAuthStore().user = { id: 8, displayName: 'other', email: 'other@example.com' }; mocks.fetchFolder.mockRejectedValue(new Error('Forbidden')); }
    if (change === 'unmount') wrapper.unmount();
    await flushPromises(); finish({ slug: 'trip' }); await flushPromises();
    expect(mocks.replace).not.toHaveBeenCalled(); if (change !== 'unmount') wrapper.unmount();
  });
});

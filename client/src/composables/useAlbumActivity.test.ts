import { defineComponent, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/auth';
import { useAlbumActivity } from './useAlbumActivity';
const record = vi.hoisted(() => vi.fn());
vi.mock('../api/activity', () => ({ recordAlbumView: record }));
let ready = ref(false), slug = ref('trip');
const Harness = defineComponent({ setup() { useAlbumActivity(() => slug.value, () => ready.value, true); }, template: '<div>Album</div>' });
beforeEach(() => {
  setActivePinia(createPinia()); vi.resetAllMocks(); record.mockResolvedValue(undefined);ready=ref(false);slug=ref('trip');
  const auth=useAuthStore();auth.authenticated=true;auth.user={id:1,email:'a@example.com',displayName:'a'};
});
afterEach(() => {document.querySelector('#fg-splash')?.remove();vi.useRealTimers();});
describe('album activity capture', () => {
  it('waits for successful data and splash dismissal, then records without counting layout changes',async()=>{
    const loader=document.createElement('div');loader.id='fg-splash';document.body.append(loader);
    const wrapper=mount(Harness);ready.value=true;await flushPromises();expect(record).not.toHaveBeenCalled();
    loader.remove();window.dispatchEvent(new Event('foldergram:album-ready'));await flushPromises();
    expect(record).toHaveBeenCalledExactlyOnceWith('trip',true);
    window.dispatchEvent(new Event('focus'));await flushPromises();expect(record).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('records later returns so the server can assign a new calendar day; removes listeners on unmount',async()=>{
    vi.useFakeTimers();ready.value=true;const wrapper=mount(Harness);await flushPromises();
    vi.setSystemTime(Date.now()+86400_000);window.dispatchEvent(new Event('focus'));await flushPromises();expect(record).toHaveBeenCalledTimes(2);
    wrapper.unmount();vi.setSystemTime(Date.now()+86400_000);window.dispatchEvent(new Event('focus'));expect(record).toHaveBeenCalledTimes(2);
  });
  it('does not identify anonymous guests or failed albums and never blocks browsing on telemetry failure',async()=>{
    useAuthStore().user=null;ready.value=true;const wrapper=mount(Harness);await flushPromises();expect(record).not.toHaveBeenCalled();
    record.mockRejectedValue(new Error('Offline'));useAuthStore().user={id:2,email:'b@example.com',displayName:'b'};await flushPromises();expect(record).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toBe('Album');wrapper.unmount();
  });
});

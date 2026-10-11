import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MobileMediaShare from './MobileMediaShare.vue';
const mountButton = () => mount(MobileMediaShare, { props: { url: '/api/originals/1?download=1' } });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('mobile photo sharing', () => {
  it('shares the original file and treats cancellation as normal', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: { isActive: true } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/jpeg' }), { headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': 'attachment; filename="birthday.jpg"' } })));
    const wrapper = mountButton();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe('birthday.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
  it('waits for another tap when preparing the file consumes activation', async () => {
    const activation = { isActive: false };
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: vi.fn().mockReturnValue(true), userActivation: activation });
    const fetch = vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/jpeg' })));
    vi.stubGlobal('fetch', fetch);
    const wrapper = mountButton();
    await wrapper.get('button').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('.mobile-media-share__ready').exists()).toBe(true);
      expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    });
    expect(share).not.toHaveBeenCalled();
    activation.isActive = true;
    await wrapper.get('button').trigger('click');
    expect(share).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('uses Android’s connected-dot icon', () => {
    vi.stubGlobal('navigator', { userAgent: 'Android', share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    expect(mountButton().findAll('circle')).toHaveLength(3);
  });
  it('uses the upward-arrow share icon on iPhone', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone', share: vi.fn(), canShare: vi.fn().mockReturnValue(true) });
    const wrapper = mountButton();
    expect(wrapper.findAll('circle')).toHaveLength(0);
    expect(wrapper.find('svg path').exists()).toBe(true);
  });
  it('falls back to downloading when file sharing is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const wrapper = mountButton();
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.get('a').attributes('href')).toBe('/api/originals/1?download=1');
    expect(wrapper.get('a').attributes('download')).toBeDefined();
  });
});

import { reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailAccessReviewView from './EmailAccessReviewView.vue';
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), confirm: vi.fn(), replace: vi.fn().mockResolvedValue(undefined), route: { hash: '' } }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('../api/email-auth', () => ({ inspectEmailAccessReview: mocks.inspect, confirmEmailAccessReview: mocks.confirm }));
describe('owner email access review', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.route = reactive({ hash: '' });
    window.history.replaceState({}, '', `/access/review#token=${'a'.repeat(43)}&decision=approve`);
    mocks.inspect.mockResolvedValue({ email: 'new@example.com' });
    mocks.confirm.mockResolvedValue({ decision: 'approve', emailSent: true });
  });
  it('removes the credential before inspection and requires a confirmation tap without asking for login', async () => {
    mocks.inspect.mockImplementation(async () => { expect(location.hash).toBe(''); return { email: 'new@example.com' }; });
    const wrapper = mount(EmailAccessReviewView); await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Approve access for new@example.com?');
    expect(wrapper.html()).not.toContain('a'.repeat(43));
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith('a'.repeat(43), 'approve');
    expect(wrapper.get('h1').text()).toBe('Access Approved');
    expect(wrapper.get('h1').classes()).toContain('font-bold');
    expect(wrapper.get('[role=status]').text()).toBe('A verification email has been sent to new@example.com.');
    wrapper.unmount();
  });
  it('opens the Deny link without acting until confirmed', async () => {
    window.history.replaceState({}, '', `/access/review#token=${'b'.repeat(43)}&decision=deny`);
    mocks.confirm.mockResolvedValue({ decision: 'deny', emailSent: false });
    const wrapper = mount(EmailAccessReviewView); await flushPromises();
    expect(wrapper.text()).toContain('Deny the request from new@example.com?');
    expect(mocks.confirm).not.toHaveBeenCalled();
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith('b'.repeat(43), 'deny');
    expect(wrapper.get('[role=status]').text()).toContain('Request denied.'); wrapper.unmount();
  });
  it('reports delivery failure without misreporting the approval outcome', async () => {
    mocks.confirm.mockResolvedValue({ decision: 'approve', emailSent: false });
    const wrapper = mount(EmailAccessReviewView); await flushPromises();
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.get('[role=status]').text()).toContain('Access approved, but'); wrapper.unmount();
  });
  it('rejects invalid links and does not offer a decision', async () => {
    mocks.inspect.mockRejectedValue(new Error('expired'));
    const wrapper = mount(EmailAccessReviewView); await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toContain('invalid, expired or already used');
    expect(wrapper.find('form').exists()).toBe(false); expect(mocks.confirm).not.toHaveBeenCalled(); wrapper.unmount();
  });
});

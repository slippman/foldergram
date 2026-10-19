import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailAccessSettings from './EmailAccessSettings.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import type { LibraryUser } from '../api/email-auth';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), approve: vi.fn(), invite: vi.fn(), remove: vi.fn(), reject: vi.fn(), users: [] as LibraryUser[] }));
vi.mock('../api/email-auth', () => ({ sendEmailInvitation: mocks.invite, fetchLibraryUsers: mocks.fetch, approveAccessRequest: mocks.approve, rejectAccessRequest: mocks.reject, deleteLibraryUser: mocks.remove }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.users = [{ id: 4, email: 'new@example.com', display_name: 'new', access_status: 'pending', requested_at: 1, last_requested_at: 1, revoked_at: null, created_at: 1, last_signed_in_at: null }];
  mocks.fetch.mockImplementation(async () => ({ items: structuredClone(mocks.users), emailSignInEnabled: true, deliveryConfigured: true, sessionDays: 90 }));
  mocks.approve.mockImplementation(async (id: number, name?: string) => {
    const user = mocks.users.find(user => user.id === id)!;
    user.access_status = 'approved'; if (name) user.display_name = name;
    return { user, emailSent: true };
  });
  mocks.reject.mockImplementation(async (id: number) => {
    mocks.users = mocks.users.filter(user => user.id !== id); return { ok: true };
  });
  mocks.remove.mockImplementation(async (id: number) => {
    mocks.users = mocks.users.filter(user => user.id !== id); return { ok: true };
  });
});

describe('access request management', () => {
  it('sends an invitation email directly and confirms the recipient', async () => {
    mocks.invite.mockResolvedValue({ emailSent: true });
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    const section = wrapper.findAll('section').find(section => section.find('h3').text() === 'Invite someone')!;
    await section.get('input[type=email]').setValue('friend@example.com');
    await section.get('form').trigger('submit'); await flushPromises();
    expect(mocks.invite).toHaveBeenCalledWith('friend@example.com');
    expect(wrapper.get('[role=status]').text()).toBe('Invitation sent to friend@example.com.');
    expect(section.find('input[readonly]').exists()).toBe(false);
    expect(section.get('input[type=email]').element.value).toBe('');
    wrapper.unmount();
  });
  it('keeps the address available to retry a failed invitation without claiming success', async () => {
    mocks.invite.mockRejectedValue(new Error('Invitation email could not be sent.'));
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    await wrapper.get('input[type=email]').setValue('friend@example.com');
    await wrapper.get('form').trigger('submit'); await flushPromises();
    expect(wrapper.find('[role=status]').exists()).toBe(false);
    expect(wrapper.get('[role=alert]').text()).toContain('could not be sent');
    expect(wrapper.get('input[type=email]').element.value).toBe('friend@example.com');
    wrapper.unmount();
  });
  it('shows a personal invitation in People without asking for a second approval', async () => {
    mocks.users[0].requested_at = null;
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    expect(wrapper.find('[data-request-id]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Invited');
    expect(wrapper.text()).not.toContain('Approve request');
    expect(wrapper.text()).toContain('Delete');
    wrapper.unmount();
  });
  it('approves a pending request, sends the first link, and moves it into People', async () => {
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    expect(wrapper.get('h2').text()).toContain('Access requests');
    expect(wrapper.get('.email-access__count').text()).toBe('1');
    expect(wrapper.text()).toContain('Email address not yet verified');
    await wrapper.findAll('button').find(button => button.text() === 'Approve request')!.trigger('click'); await flushPromises();
    expect(mocks.approve).toHaveBeenCalledWith(4);
    expect(wrapper.find('[data-request-id="4"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('A sign-in email has been sent.');
    wrapper.unmount();
  });
  it('rejects a pending request only after confirmation, and removes it from the list', async () => {
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Reject Request')!.trigger('click');
    expect(mocks.reject).not.toHaveBeenCalled();
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises();
    expect(mocks.reject).toHaveBeenCalledWith(4);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(wrapper.find('[data-request-id="4"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Request rejected.'); wrapper.unmount();
  });
  it('offers deletion instead of ban and removes the redundant approval form', async () => {
    mocks.users[0].access_status = 'approved';
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    expect(wrapper.text()).not.toContain('Approve someone directly');
    expect(wrapper.text()).not.toContain('Ban');
    expect(wrapper.text()).not.toContain('Copy join');
    await wrapper.findAll('button').find(button => button.text() === 'Delete')!.trigger('click');
    const dialog = wrapper.findComponent(ConfirmDialog);
    expect(dialog.props('message')).toContain('new@example.com');
    expect(dialog.props('message')).toContain('saved likes');
    expect(mocks.remove).not.toHaveBeenCalled();
    dialog.vm.$emit('cancel'); await flushPromises();
    expect(mocks.remove).not.toHaveBeenCalled();
    await wrapper.findAll('button').find(button => button.text() === 'Delete')!.trigger('click');
    wrapper.findComponent(ConfirmDialog).vm.$emit('confirm'); await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith(4);
    expect(wrapper.text()).not.toContain('new@example.com');
    expect(wrapper.text()).toContain('User deleted.');
    expect(wrapper.get('[role=status]').element.closest('.email-access__section')?.querySelector('h3')?.textContent).toContain('People');
    wrapper.unmount();
  });
  it('does not claim delivery success when approval succeeds but sending fails', async () => {
    mocks.approve.mockImplementation(async () => { mocks.users[0].access_status = 'approved'; return { user: mocks.users[0], emailSent: false }; });
    const wrapper = mount(EmailAccessSettings); await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Approve request')!.trigger('click'); await flushPromises();
    expect(wrapper.get('[role=status]').text()).toContain('email could not be sent');
    expect(wrapper.find('[data-request-id="4"]').exists()).toBe(false); wrapper.unmount();
  });
});

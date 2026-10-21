import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmailActivitySettings from './EmailActivitySettings.vue';
const api=vi.hoisted(()=>({summary:vi.fn(),detail:vi.fn(),signedIn:vi.fn()}));
vi.mock('../api/activity',()=>({fetchActivity:api.summary,fetchAccountActivity:api.detail,fetchSignedInActivity:api.signedIn}));
describe('account activity report',()=>{
  beforeEach(() => {
    vi.clearAllMocks();
    api.signedIn.mockResolvedValue({items:[{id:1,email:'family@example.com',lastActiveAt:null,sessionCount:2}],total:1,limit:100,timezone:'America/Denver'});
  });
  it('shows email identities, changes periods and expands private album/like details',async()=>{
    api.summary.mockResolvedValue({items:[{id:1,email:'family@example.com',loginCount:2,joinedAt:Date.parse('2026-10-17T18:00:00Z'),lastLoginAt:null,lastActiveAt:null,albumViews:3,uniqueAlbums:1,likes:2},{id:2,email:'invited@example.com',loginCount:0,joinedAt:null,lastLoginAt:null,lastActiveAt:null,albumViews:0,uniqueAlbums:0,likes:0}],total:2,page:1,hasMore:false,timezone:'America/Denver',captureStartedAt:Date.now()});
    api.detail.mockResolvedValue({albums:[{albumKey:'opaque',name:'Rush',slug:'rush',views:3,lastViewedAt:Date.now()}],likes:[],detailLimit:200});
    const wrapper=mount(EmailActivitySettings,{global:{stubs:{RouterLink:true}}});await flushPromises();
    expect(wrapper.get('.account-activity__signed-in').text()).toContain('Signed-in users');
    expect(wrapper.get('.account-activity__signed-in-table').text()).toContain('family@example.com');
    expect(wrapper.text()).toContain('family@example.com');expect(wrapper.text()).toContain('America/Denver');
    expect(wrapper.findAll('th').map(th=>th.text())).toContain('First joined');expect(wrapper.findAll('th').map(th=>th.text())).not.toContain('Last login');expect(wrapper.text()).toContain('Oct 17, 2026');
    expect(wrapper.get('.account-activity__history-table').findAll('tbody > tr')[1].findAll('td')[2].text()).toBe('');
    await wrapper.get('.account-activity__identity').trigger('click');await flushPromises();expect(api.detail).toHaveBeenCalledWith(1,'all');expect(wrapper.text()).toContain('Rush');
    await wrapper.get('select').setValue('today');await flushPromises();expect(api.summary).toHaveBeenLastCalledWith('today',1);expect(wrapper.find('.account-activity__detail').exists()).toBe(false);wrapper.unmount();
  });
  it('refreshes signed-in users without collapsing details, suspends hidden polling and cleans up', async () => {
    vi.useFakeTimers({toFake:['setInterval','clearInterval']});
    const visibility = vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
    api.summary.mockResolvedValue({items:[{id:1,email:'family@example.com',loginCount:1,joinedAt:null,lastLoginAt:null,lastActiveAt:null,albumViews:0,uniqueAlbums:0,likes:0}],total:1,page:1,hasMore:false,timezone:'America/Denver',captureStartedAt:Date.now()});
    api.detail.mockResolvedValue({albums:[],likes:[],detailLimit:200});
    const wrapper = mount(EmailActivitySettings,{global:{stubs:{RouterLink:true}}});
    try {
      await flushPromises();
      await wrapper.get('.account-activity__identity').trigger('click');
      await flushPromises();
      api.signedIn.mockResolvedValue({items:[],total:0,limit:100,timezone:'America/Denver'});
      await vi.advanceTimersByTimeAsync(30000);
      expect(wrapper.get('.account-activity__signed-in').text()).toContain('No signed-in users.');
      expect(wrapper.find('.account-activity__detail').exists()).toBe(true);
      expect(api.summary).toHaveBeenCalledTimes(1);
      expect(api.signedIn).toHaveBeenCalledTimes(2);
      visibility.mockReturnValue('hidden');
      await vi.advanceTimersByTimeAsync(30000);
      expect(api.signedIn).toHaveBeenCalledTimes(2);
      visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));
      await flushPromises();
      expect(api.signedIn).toHaveBeenCalledTimes(3);
      wrapper.unmount();
      await vi.advanceTimersByTimeAsync(30000);
      document.dispatchEvent(new Event('visibilitychange'));
      expect(api.signedIn).toHaveBeenCalledTimes(3);
    } finally {
      if (wrapper.exists()) wrapper.unmount();
      visibility.mockRestore();vi.useRealTimers();
    }
  });

});

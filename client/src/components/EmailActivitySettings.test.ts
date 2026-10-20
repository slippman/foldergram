import { mount, flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import EmailActivitySettings from './EmailActivitySettings.vue';
const api=vi.hoisted(()=>({summary:vi.fn(),detail:vi.fn()}));
vi.mock('../api/activity',()=>({fetchActivity:api.summary,fetchAccountActivity:api.detail}));
describe('account activity report',()=>{
  it('shows email identities, changes periods and expands private album/like details',async()=>{
    api.summary.mockResolvedValue({items:[{id:1,email:'family@example.com',loginCount:2,lastLoginAt:null,lastActiveAt:null,albumViews:3,uniqueAlbums:1,likes:2}],total:1,page:1,hasMore:false,timezone:'America/Denver',captureStartedAt:Date.now()});
    api.detail.mockResolvedValue({albums:[{albumKey:'opaque',name:'Rush',slug:'rush',views:3,lastViewedAt:Date.now()}],likes:[],detailLimit:200});
    const wrapper=mount(EmailActivitySettings,{global:{stubs:{RouterLink:true}}});await flushPromises();
    expect(wrapper.text()).toContain('family@example.com');expect(wrapper.text()).toContain('America/Denver');
    await wrapper.get('.account-activity__identity').trigger('click');await flushPromises();expect(api.detail).toHaveBeenCalledWith(1,'all');expect(wrapper.text()).toContain('Rush');
    await wrapper.get('select').setValue('today');await flushPromises();expect(api.summary).toHaveBeenLastCalledWith('today',1);expect(wrapper.find('.account-activity__detail').exists()).toBe(false);wrapper.unmount();
  });
});

import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { useAuthStore } from '../stores/auth';
import { useLikesStore } from '../stores/likes';
import * as http from '../api/http';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SharedFavoriteButton from './SharedFavoriteButton.vue';

describe('shared album favorites', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks(); });
  it('persists an email account favorite through its scoped API without inserting hidden posts into the normal Likes feed', async () => {
    const auth=useAuthStore();auth.user={id:1,email:'family@example.com',displayName:'family'};auth.likesMode='personal';
    const request=vi.spyOn(http,'requestJson').mockResolvedValue({id:7,liked:true,likeCount:1});
    const item={id:7,isLiked:false,likeCount:0} as any;
    const wrapper=mount(SharedFavoriteButton,{props:{slug:'private-family',id:7,item}});
    await wrapper.get('button').trigger('click');await flushPromises();
    expect(request).toHaveBeenCalledWith('/api/share/posts/7/like',{method:'POST'});
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true');
    expect(useLikesStore().items).toEqual([]);
    expect(useLikesStore().counts[7]).toBe(1);wrapper.unmount();
  });
  it('synchronizes scroll and zoom buttons, stores only IDs, and isolates albums', async () => {
    const first = mount(SharedFavoriteButton, { props: { slug: 'test-family', id: 7 } });
    const zoom = mount(SharedFavoriteButton, { props: { slug: 'test-family', id: 7 } });
    const other = mount(SharedFavoriteButton, { props: { slug: 'test-travel', id: 7 } });
    await first.get('button').trigger('click');
    expect(zoom.get('button').attributes('aria-pressed')).toBe('true');
    expect(other.get('button').attributes('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('foldergram-share-favorites:test-family')!)).toEqual([7]);
    await zoom.get('button').trigger('click');
    expect(first.get('button').attributes('aria-pressed')).toBe('false');
  });
});

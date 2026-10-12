import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SharedFavoriteButton from './SharedFavoriteButton.vue';

describe('shared album favorites', () => {
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

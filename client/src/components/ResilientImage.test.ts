import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ResilientImage from './ResilientImage.vue';

describe('ResilientImage', () => {
  it('shows loading until the photo arrives and restores it for another photo', async () => {
    const wrapper = mount(ResilientImage, {
      props: { src: '/photo.webp', alt: '', showLoading: true, maxRetries: 0 },
      attrs: { class: 'photo' }
    });
    expect(wrapper.get('[role="status"]').text()).toBe('Loading image…');
    expect(wrapper.get('img').classes()).toContain('photo');
    await wrapper.get('img').trigger('load');
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    await wrapper.setProps({ src: '/another.webp' });
    expect(wrapper.get('[role="status"]').text()).toBe('Loading image…');
    await wrapper.get('img').trigger('error');
    expect(wrapper.get('[role="status"]').text()).toBe('Unable to load image');
  });
  it('falls back to the original source when the preview source fails', async () => {
    const wrapper = mount(ResilientImage, {
      props: {
        src: '/previews/NaturePlanet/pexels-photo-2770371.webp',
        fallbackSrc: '/api/originals/2770371',
        alt: 'NaturePlanet preview',
        loading: 'eager'
      }
    });

    expect(wrapper.get('img').attributes('src')).toContain('/previews/NaturePlanet/pexels-photo-2770371.webp');

    await wrapper.get('img').trigger('error');
    await nextTick();

    expect(wrapper.get('img').attributes('src')).toContain('/api/originals/2770371');
  });
});

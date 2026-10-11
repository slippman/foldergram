import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import ConfirmDialog from './ConfirmDialog.vue';

it('focuses Cancel so Escape dismisses the dialog, then restores viewer focus', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const wrapper = mount(ConfirmDialog, {
    attachTo: document.body,
    props: { title: 'Delete photo?', message: 'Confirm deletion.' }
  });
  expect(document.activeElement).toBe(wrapper.get('button').element);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.activeElement?.dispatchEvent(escape);
  expect(wrapper.emitted('cancel')).toEqual([[]]);
  expect(wrapper.emitted('confirm')).toBeUndefined();
  expect(escape.defaultPrevented).toBe(true);
  wrapper.unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

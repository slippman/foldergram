import { shallowRef } from 'vue';

// Shared by feed posts and the fullscreen viewer, for the lifetime of the page.
const active = shallowRef<{ owner: symbol; jump: () => void } | null>(null);

export function useCinemaVideoShare(jump: () => void) {
  const owner = Symbol('cinema-video-share');
  return {
    active,
    claim() {
      if (active.value && active.value.owner !== owner) return false;
      active.value = { owner, jump };
      return true;
    },
    release() {
      if (active.value?.owner === owner) active.value = null;
    }
  };
}

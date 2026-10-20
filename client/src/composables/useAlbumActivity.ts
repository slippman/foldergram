import { onMounted, onBeforeUnmount, watch } from 'vue';
import { recordAlbumView } from '../api/activity';
import { useAuthStore } from '../stores/auth';

export function useAlbumActivity(slug: () => string, ready: () => boolean, shared = false) {
  const auth = useAuthStore();
  let lastKey = '';
  let lastSentAt = 0;
  let stopped = false;
  async function record() {
    if (stopped || document.querySelector('#fg-splash') || document.visibilityState === 'hidden' || !auth.authenticated || !auth.user || !ready()) return;
    const currentSlug = slug();
    if (!currentSlug) return;
    const key = `${auth.user.id}:${currentSlug}`;
    if (key === lastKey && Date.now() - lastSentAt < 60_000) return;
    lastKey = key; lastSentAt = Date.now();
    try { await recordAlbumView(currentSlug, shared); }
    catch { if (lastKey === key) lastSentAt = 0; } // Metrics must never block album browsing.
  }
  watch(() => [slug(), ready(), auth.authenticated, auth.user?.id], record, { flush: 'post' });
  onMounted(() => {
    void record();
    window.addEventListener('foldergram:album-ready', record);
    window.addEventListener('focus', record);
    document.addEventListener('visibilitychange', record);
  });
  onBeforeUnmount(() => {
    stopped = true;
    window.removeEventListener('foldergram:album-ready', record);
    window.removeEventListener('focus', record);
    document.removeEventListener('visibilitychange', record);
  });
}

import { ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import { fetchFolder } from '../api/gallery';
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';

/** A share credential never establishes library access; check the protected album API. */
export function useSharedAlbumRedirect() {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const app = useAppStore();
  const pending = ref(false);

  watch(() => [route.fullPath, auth.ready, auth.enabled, auth.authenticated, auth.role, auth.user?.id] as const,
    async (_value, _previous, onCleanup) => {
      let cancelled = false;
      onCleanup(() => { cancelled = true; pending.value = false; });
      if (route.name !== 'shared-folder' || !auth.ready || !auth.enabled || !auth.authenticated || auth.role === 'anonymous') return;
      const slug = String(route.params.slug ?? '');
      if (!slug) return;
      const query: LocationQueryRaw = {};
      if (route.query.view === 'scroll') {
        query.view = 'scroll';
        const photo = route.query.photo;
        if (typeof photo === 'string' && /^\d+$/.test(photo) && Number.isSafeInteger(Number(photo)) && Number(photo) > 0) query.photo = photo;
      }
      pending.value = true;
      try {
        const folder = await fetchFolder(slug);
        if (cancelled) return;
        app.clearImageModalBackground();
        // Named internal route, no share fragment or untrusted return URL carried forward.
        await router.replace({ name: 'folder', params: { slug: folder.slug }, query });
      } catch {
        // A stale session or album restriction falls back to the scoped share flow.
      } finally { if (!cancelled) pending.value = false; }
    }, { immediate: true });
  return pending;
}

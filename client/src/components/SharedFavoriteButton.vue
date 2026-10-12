<template>
  <button type="button" class="media-action" :class="{ 'media-action--liked': liked }"
    :aria-pressed="liked" :aria-label="label" :title="label" @click="toggle">
    <span class="w-[1.45rem] h-[1.45rem]" :class="liked ? 'i-fluent-heart-20-filled' : 'i-fluent-heart-20-regular'" aria-hidden="true" />
  </button>
</template>
<script lang="ts">
import { ref, type Ref } from 'vue';
// Save only IDs. A favorite never grants access to an album or stores its URLs.
const favorites = new Map<string, Ref<number[]>>();
function albumFavorites(slug: string): Ref<number[]> {
  const existing = favorites.get(slug);
  if (existing) return existing;
  let ids: number[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(`foldergram-share-favorites:${slug}`) ?? '[]');
    if (Array.isArray(stored)) ids = stored.filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  } catch { /* Private browsing may disable storage. */ }
  const value = ref(ids);
  favorites.set(slug, value);
  return value;
}
</script>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
const props = defineProps<{ slug: string; id: number }>();
const { t } = useI18n();
const ids = computed(() => albumFavorites(props.slug));
const liked = computed(() => ids.value.value.includes(props.id));
const label = computed(() => t(liked.value ? 'likes.actions.removeFavoriteFromPost' : 'likes.actions.favoritePost'));
function toggle() {
  const value = ids.value;
  value.value = liked.value ? value.value.filter(id => id !== props.id) : [...value.value, props.id];
  try { localStorage.setItem(`foldergram-share-favorites:${props.slug}`, JSON.stringify(value.value)); }
  catch { /* Keep this session's favorites when storage is unavailable. */ }
}
</script>

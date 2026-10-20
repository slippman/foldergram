<template>
  <p class="cinema-browse-hint" :class="{ 'cinema-browse-hint--reels': mode === 'reels' }">
    <span class="cinema-browse-hint__tap">{{ t(mode === 'reels' ? 'reels.view.browseHint' : mode === 'scroll' ? 'share.scrollHint' : 'share.browseHint') }}</span>
    <span class="cinema-browse-hint__click">{{ t(mode === 'reels' ? 'reels.view.browseHintClick' : mode === 'scroll' ? 'share.scrollHintClick' : 'share.browseHintClick') }}</span>
  </p>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
withDefaults(defineProps<{ mode?: 'grid' | 'scroll' | 'reels' }>(), { mode: 'grid' });
const { t } = useI18n();
</script>

<style scoped>
.cinema-browse-hint { flex: 0 0 100%; margin: 0 0 0.125rem; color: var(--muted); font-size: 0.8125rem; line-height: 1.4; text-align: left; }
@media (min-width: 768px) {
  .cinema-browse-hint:not(.cinema-browse-hint--reels) { display: none; }
}
.cinema-browse-hint__tap { display: none; }
@media (pointer: coarse) {
  .cinema-browse-hint__tap { display: inline; }
  .cinema-browse-hint__click { display: none; }
}
</style>

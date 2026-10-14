<template>
  <CinemaHeader class="album-header" :class="{ 'album-header--back': backTo }" :title="title">
    <template v-if="backTo" #leading>
      <RouterLink :to="backTo" class="album-header__back" :class="backClass" :aria-label="backLabel">
        <span class="i-fluent-arrow-left-20-regular h-5 w-5" aria-hidden="true" />
      </RouterLink>
    </template>
    <template #trailing>
      <span v-if="$slots.actions" class="album-header__actions"><slot name="actions" /></span>
      <span v-if="showHint" class="album-header__hint">{{ t('share.browseHint') }}</span>
      <span class="album-header__brand">UnReeled Photos</span>
    </template>
  </CinemaHeader>
</template>

<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import { useI18n } from 'vue-i18n';
import CinemaHeader from './CinemaHeader.vue';
defineProps<{ title: string; showHint?: boolean; backTo?: RouteLocationRaw; backLabel?: string; backClass?: string }>();
const { t } = useI18n();
</script>

<style scoped>
.album-header { width: 100%; min-width: 0; max-width: 100%; gap: 0.5rem; margin-bottom: 0; min-height: 3rem; }
.album-header :deep(h1) { flex: 1 1 0; width: 0; min-width: 0; font-size: 0.95rem; font-weight: 600; letter-spacing: -0.02em; }
.album-header__brand { flex: none; white-space: nowrap; color: var(--muted); font-size: 0.8rem; font-weight: 600; letter-spacing: -0.02em; }
.album-header__hint { display: none; color: var(--muted); font-size: 0.8rem; white-space: nowrap; }
.album-header__actions { display: inline-flex; align-items: center; gap: 0.5rem; flex: none; }
@media (max-width: 767px) {
  .album-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 0.5rem; row-gap: 0.15rem; padding: 0.5rem 0; }
  .album-header :deep(h1) { grid-column: 1; grid-row: 1; width: auto; }
  .album-header__brand { grid-column: 1; grid-row: 2; font-size: 0.75rem; font-weight: 500; line-height: 1.25; }
  .album-header__hint { display: block; grid-column: 1 / -1; grid-row: 3; min-width: 0; margin-top: 0.35rem; white-space: normal; line-height: 1.4; }
  .album-header__actions { grid-column: 2; grid-row: 1 / span 2; }
  .album-header--back { grid-template-columns: auto minmax(0, 1fr) auto; }
  .album-header--back :deep(h1), .album-header--back .album-header__brand { grid-column: 2; }
  .album-header--back .album-header__actions { grid-column: 3; }
  .album-header__back { grid-column: 1; grid-row: 1 / span 2; }
}
@media (min-width: 768px) and (max-width: 1199px) {
  .album-header { flex-wrap: wrap; }
  .album-header__hint { display: block; order: 1; flex-basis: 100%; white-space: normal; line-height: 1.4; padding-bottom: 0.25rem; }
}
@media (min-width: 1200px) {
  .album-header { gap: 1.5rem; }
  .album-header :deep(h1) { font-size: 1rem; }
  .album-header__brand { font-size: 0.9rem; }
  .album-header__hint { display: inline; }
}
.album-header__back { display: inline-flex; flex: none; align-items: center; justify-content: center; padding: 0.5rem; color: inherit; border-radius: 50%; }
.album-header__back:hover { background: var(--surface-hover); }
</style>

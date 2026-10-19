<template>
  <CinemaHeader class="album-header" :class="{ 'album-header--back': backTo }" :title="title">
    <template v-if="backTo" #leading>
      <RouterLink :to="backTo" class="album-header__back" :class="backClass" :aria-label="backLabel" :title="backLabel">
        <span class="i-fluent-chevron-left-20-regular h-4 w-4" aria-hidden="true" />
      </RouterLink>
    </template>
    <template #trailing>
      <span class="album-header__brand">UnReeled Photos</span>
      <span class="album-header__actions"><slot name="actions" /><CinemaAccountMenu /></span>
      <CinemaBrowseHint v-if="hint" class="album-header__hint" :mode="hint" />
    </template>
  </CinemaHeader>
</template>

<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';
import CinemaHeader from './CinemaHeader.vue';
import CinemaAccountMenu from './CinemaAccountMenu.vue';
import CinemaBrowseHint from './CinemaBrowseHint.vue';
defineProps<{ title: string; hint?: 'grid' | 'scroll'; backTo?: RouteLocationRaw; backLabel?: string; backClass?: string }>();
</script>

<style scoped>
.album-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; width: 100%; min-width: 0; max-width: 100%; column-gap: 0.75rem; row-gap: 0.125rem; align-items: center; padding: 0.625rem 0; margin-bottom: 0; min-height: 3rem; }
.album-header :deep(h1) { grid-column: 1; grid-row: 1; width: auto; min-width: 0; font-size: 1rem; font-weight: 600; line-height: 1.25; letter-spacing: -0.02em; }
.album-header__brand { grid-column: 1; grid-row: 2; color: color-mix(in srgb, var(--text) 65%, var(--muted)); font-size: 0.8125rem; font-weight: 600; line-height: 1.4; }
.album-header__actions { grid-column: 2; grid-row: 1 / span 2; display: inline-flex; align-items: center; justify-content: flex-end; gap: 0.5rem; }
.album-header__hint { grid-column: 1 / -1; grid-row: 3; min-width: 0; margin-top: 0.5rem; }
.album-header--back { grid-template-columns: auto minmax(0, 1fr) auto; }
.album-header--back :deep(h1), .album-header--back .album-header__brand { grid-column: 2; }
.album-header--back .album-header__actions { grid-column: 3; }
.album-header__back { grid-column: 1; grid-row: 1 / span 2; display: inline-flex; flex: none; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; padding: 0; border: 1px solid color-mix(in srgb, var(--text) 18%, var(--bg)); border-radius: 50%; background: color-mix(in srgb, var(--text) 12%, var(--bg)); color: var(--text); cursor: pointer; }
.album-header__back:hover { background: color-mix(in srgb, var(--text) 18%, var(--bg)); }
.album-header__back:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
@media (max-width: 767px) {
  .album-header { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); grid-template-rows: 3rem auto; column-gap: 0.5rem; row-gap: 0.5rem; }
  .album-header::before { content: ''; grid-column: 1 / -1; grid-row: 1; align-self: stretch; border: 1px solid color-mix(in srgb, var(--text) 8%, var(--bg)); border-radius: 0.875rem; background: color-mix(in srgb, var(--text) 4%, var(--bg)); pointer-events: none; }
  .album-header :deep(h1) { grid-column: 1 / -1; grid-row: 2; white-space: normal; overflow-wrap: anywhere; }
  .album-header .album-header__brand { grid-column: 2; grid-row: 1; color: var(--text); letter-spacing: -0.01em; text-align: center; }
  .album-header:not(.album-header--back) .album-header__brand { grid-column: 1 / 3; justify-self: start; margin-left: 0.875rem; text-align: left; }
  .album-header .album-header__actions { grid-column: 3; grid-row: 1; justify-self: end; margin-right: 0.25rem; }
  .album-header__back { grid-column: 1; grid-row: 1; justify-self: start; width: 2.75rem; height: 2.75rem; margin-left: 0.25rem; }
  .album-header__hint { grid-row: 3; margin-top: 0.125rem; }
}
</style>

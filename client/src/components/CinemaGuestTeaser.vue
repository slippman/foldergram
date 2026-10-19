<template>
  <aside v-if="auth.ready && auth.enabled && !auth.authenticated && auth.accessMode === 'email'" class="cinema-guest-teaser">
    <h2>{{ t('share.guestTeaserTitle') }}</h2>
    <RouterLink class="cinema-guest-teaser__action" to="/signin">{{ t('share.guestTeaserAction') }}</RouterLink>
  </aside>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
const auth = useAuthStore();
const { t } = useI18n();
</script>

<style scoped>
.cinema-guest-teaser { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 0.75rem; width: fit-content; max-width: 100%; margin: 0.75rem auto; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: 0.875rem; background: color-mix(in srgb, var(--text) 3%, var(--bg)); color: var(--text); text-align: center; }
.cinema-guest-teaser h2 { margin: 0; font-size: 0.9375rem; font-weight: 600; line-height: 1.4; letter-spacing: -0.01em; }
.cinema-guest-teaser__action { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: 0.5rem 0.875rem; border: 1px solid color-mix(in srgb, var(--text) 18%, var(--bg)); border-radius: 999px; background: color-mix(in srgb, var(--text) 12%, var(--bg)); color: var(--text); font-size: 0.8125rem; font-weight: 600; line-height: 1.4; text-decoration: none; }
.cinema-guest-teaser__action:hover { background: color-mix(in srgb, var(--text) 18%, var(--bg)); }
.cinema-guest-teaser__action:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
@media (max-width: 479px) { .cinema-guest-teaser { flex-direction: column; gap: 0.5rem; } }
</style>

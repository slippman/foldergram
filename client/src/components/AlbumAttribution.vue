<template>
  <footer class="album-attribution">
    <a class="album-attribution__brand-link" href="https://slip.unreeled.com" target="_blank" rel="noopener noreferrer">
      <img class="album-attribution__logo" :src="'/branding/ur-logo-4e4dc1180945.png'" alt="UnReeled" width="144" height="144" loading="lazy" />
    </a>
    <a href="https://github.com/slippman/foldergram" target="_blank" rel="noopener noreferrer">{{ t('share.poweredBy') }}</a>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<style scoped>
.album-attribution { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; background: var(--bg); isolation: isolate; margin-top: 2rem; padding-bottom: 1rem; font-size: 0.75rem; color: var(--muted); }
.album-attribution__brand-link { display: inline-flex; flex: none; mix-blend-mode: var(--ur-logo-blend, multiply); }
.album-attribution__logo { width: 144px; height: 144px; flex: none; object-fit: contain; filter: var(--ur-logo-filter, none); }
.album-attribution a { color: inherit; text-decoration: none; }
.album-attribution a:hover { color: var(--text); text-decoration: underline; }
.album-attribution a:focus-visible { outline: 2px solid currentColor; outline-offset: 4px; border-radius: 2px; }
@media (max-width: 767px) {
  .album-attribution__logo { width: 112px; height: 112px; }
}
</style>

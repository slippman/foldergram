<template>
  <div v-if="auth.enabled && (auth.authenticated || auth.accessMode === 'email')" ref="root" class="cinema-account" @keydown.esc.stop.prevent="close(true)">
    <button v-if="auth.authenticated" ref="trigger" class="cinema-account__trigger" type="button" :aria-label="t('account.open', { name })" aria-haspopup="dialog" :aria-expanded="open" :title="name" @click="toggle">
      <span class="cinema-account__avatar" aria-hidden="true">{{ initials }}</span>
      <span class="cinema-account__name">{{ name }}</span>
    </button>
    <RouterLink v-else class="cinema-account__sign-in" to="/signin">{{ t('account.signIn') }}</RouterLink>
    <section v-if="open && auth.authenticated" class="cinema-account__panel" role="dialog" :aria-label="t('account.title')">
      <AccountIdentity />
      <p v-if="error" class="cinema-account__error" role="alert">{{ error }}</p>
      <button ref="signOutButton" class="cinema-account__sign-out" type="button" :disabled="auth.loading" @click="signOut">{{ t('nav.signOut') }}</button>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import AccountIdentity from './AccountIdentity.vue';
const auth = useAuthStore();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const signOutButton = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const error = ref('');
const name = computed(() => auth.user?.displayName || t(auth.isAdmin ? 'account.admin' : 'account.viewer'));
const initials = computed(() => name.value.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]?.toUpperCase()).join(''));
function close(restoreFocus = false) { open.value = false; if (restoreFocus) trigger.value?.focus(); }
async function toggle() { open.value = !open.value; error.value = ''; if (open.value) { await nextTick(); signOutButton.value?.focus(); } }
function outside(event: PointerEvent) { if (event.target instanceof Node && !root.value?.contains(event.target)) close(); }
async function signOut() {
  if (auth.loading) return;
  error.value = '';
  try { await auth.logout(); close(); } catch { error.value = t('account.signOutFailed'); }
}
watch(() => [auth.authenticated, auth.user?.id, auth.user?.email], () => close());
onMounted(() => document.addEventListener('pointerdown', outside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>
<style scoped>
.cinema-account { position: relative; flex: none; margin-left: auto; }
.cinema-account__trigger { display: flex; align-items: center; gap: .5rem; min-height: 2.75rem; padding: .125rem; border: 0; border-radius: 999px; background: transparent; color: var(--text); cursor: pointer; font: inherit; }
.cinema-account__avatar { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 50%; border: 1px solid var(--border); background: var(--surface-alt); font-size: .8rem; font-weight: 700; }
.cinema-account__name { display: none; max-width: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8rem; }
.cinema-account__trigger:hover { background: var(--surface-hover); }
.cinema-account__trigger:focus-visible, .cinema-account__sign-in:focus-visible, .cinema-account__sign-out:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
.cinema-account__panel { position: absolute; right: 0; top: calc(100% + .5rem); z-index: 60; width: min(20rem, calc(100vw - 2rem)); border: 1px solid var(--border); border-radius: 1rem; background: var(--surface); box-shadow: 0 16px 48px rgb(0 0 0 / 16%); color: var(--text); }
.cinema-account__sign-in, .cinema-account__sign-out { display: inline-flex; align-items: center; justify-content: center; min-height: 2.75rem; padding: .5rem 1rem; border: 1px solid var(--text); border-radius: .75rem; background: var(--text); color: var(--bg); font: inherit; font-size: .8rem; font-weight: 600; text-decoration: none; cursor: pointer; }
.cinema-account__sign-out { margin: .75rem; width: calc(100% - 1.5rem); }
.cinema-account__sign-in { min-height: 2.25rem; padding: .375rem .75rem; border-color: var(--border); border-radius: .5rem; background: transparent; color: var(--text); white-space: nowrap; }
.cinema-account__sign-in:hover { background: var(--surface-hover); }
@media (max-width: 767px) { .cinema-account__sign-in { min-height: 2.75rem; } }
.cinema-account__sign-out:disabled { opacity: .6; cursor: wait; }
.cinema-account__error { padding: 0 1rem; white-space: normal; font-size: .8rem; }
@media (min-width: 1200px) { .cinema-account__name { display: inline; padding-right: .5rem; } }
</style>

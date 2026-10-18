<template>
  <div class="account-identity">
    <span class="account-identity__avatar" aria-hidden="true">{{ initials }}</span>
    <div class="account-identity__details">
      <small>{{ t('account.signedInAs') }}</small>
      <strong>{{ name }}</strong>
      <span v-if="auth.user?.email && auth.user.email !== name && auth.user.email.split('@')[0] !== name">{{ auth.user.email }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
const auth = useAuthStore();
const { t } = useI18n();
const name = computed(() => auth.user?.displayName || t(auth.isAdmin ? 'account.admin' : 'account.viewer'));
const initials = computed(() => name.value.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]?.toUpperCase()).join(''));
</script>
<style scoped>
.account-identity { display: flex; align-items: center; gap: .75rem; padding: 1rem; border-bottom: 1px solid var(--border); color: var(--text); }
.account-identity__avatar { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; flex: none; border: 1px solid var(--border); border-radius: 50%; background: var(--surface-alt); font-size: .85rem; font-weight: 700; }
.account-identity__details { display: grid; gap: .15rem; min-width: 0; text-align: left; }
.account-identity__details small { color: var(--muted); font-size: .7rem; }
.account-identity__details strong { overflow-wrap: anywhere; font-size: .875rem; font-weight: 600; }
.account-identity__details > span { overflow-wrap: anywhere; color: var(--muted); font-size: .8rem; }
</style>

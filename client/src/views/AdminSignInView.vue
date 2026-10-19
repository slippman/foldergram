<template>
  <AuthGate admin-only />
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import AuthGate from '../components/AuthGate.vue';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
watch(() => auth.ready && auth.isAdmin, (isAdmin) => {
  if (isAdmin) void router.replace('/settings');
}, { immediate: true });
</script>

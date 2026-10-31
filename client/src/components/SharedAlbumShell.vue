<template>
  <AppShell :bare="!showNavigation" :cinema="cinema">
    <slot />
  </AppShell>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppShell from './AppShell.vue';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ cinema: boolean }>();
const auth = useAuthStore();
// A share cookie alone never establishes a signed-in library session.
const showNavigation = computed(() => props.cinema && auth.ready && auth.enabled && auth.authenticated && auth.role !== 'anonymous');
</script>

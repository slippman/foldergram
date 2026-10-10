<template>
  <header class="cinema-header">
    <slot name="leading" />
    <h1>{{ title }}</h1>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<style scoped>
.cinema-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.75rem;
  padding: 0.25rem 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  margin-bottom: 0.5rem;
}
.cinema-header h1 {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 500;
}
</style>

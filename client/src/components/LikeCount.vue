<template>
  <span v-if="count > 0" class="cinema-like-count" :aria-label="t('activity.likeCount', { count })">{{ count }}</span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLikesStore } from '../stores/likes';
const props = defineProps<{ item: { id: number; likeCount?: number } }>();
const likes = useLikesStore();
const { t } = useI18n();
const count = computed(() => likes.likeCount(props.item));
</script>
<style scoped>
.cinema-like-count { margin-left: -.35rem; margin-right: .25rem; color: var(--muted); font-size: .8125rem; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>

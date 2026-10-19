<template>
  <img
    ref="imageElement"
    v-bind="$attrs"
    v-if="resolvedSrc"
    :src="resolvedSrc"
    :alt="alt"
    :width="width"
    :height="height"
    :loading="loading"
    :data-loaded="loaded ? 'true' : 'false'"
    data-album-resilient
    @load="handleLoad"
    @error="handleError"
  />
  <span hidden :data-album-image-state="!src || loaded ? 'ready' : hiddenUntilRetry && !retryWhile && attempt >= maxRetries ? 'error' : 'loading'" />
  <span v-if="showLoading && !loaded" class="image-loading" role="status">
    {{ t(hiddenUntilRetry && !retryWhile && attempt >= maxRetries ? 'common.imageLoadFailed' : 'common.loadingImage') }}
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({ inheritAttrs: false });
const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    src: string | null;
    showLoading?: boolean;
    fallbackSrc?: string | null;
    alt: string;
    width?: number;
    height?: number;
    loading?: 'lazy' | 'eager';
    retryWhile?: boolean;
    maxRetries?: number;
    retryDelayMs?: number;
  }>(),
  {
    src: null,
    fallbackSrc: null,
    loading: 'lazy',
    retryWhile: false,
    maxRetries: 8,
    retryDelayMs: 1500
  }
);

const attempt = ref(0);
const loaded = ref(false);
const hiddenUntilRetry = ref(false);
const usingFallback = ref(false);
const imageElement = ref<HTMLImageElement | null>(null);
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let completionTimer: ReturnType<typeof setInterval> | null = null;

function clearCompletionTimer() {
  if (completionTimer !== null) clearInterval(completionTimer);
  completionTimer = null;
}

const activeSrc = computed(() => {
  if (usingFallback.value && props.fallbackSrc && props.fallbackSrc !== props.src) {
    return props.fallbackSrc;
  }

  return props.src;
});

const resolvedSrc = computed(() => {
  if (!activeSrc.value || hiddenUntilRetry.value) {
    return null;
  }

  if (attempt.value === 0) {
    return activeSrc.value;
  }

  const separator = activeSrc.value.includes('?') ? '&' : '?';
  return `${activeSrc.value}${separator}retry=${attempt.value}`;
});

// Cached images can finish without a fresh load event on a restored page.
// Check successful completion only: failures still follow the normal retry path.
watch([imageElement, resolvedSrc, loaded], () => {
  clearCompletionTimer();
  const image = imageElement.value;
  if (!image || !resolvedSrc.value || loaded.value) return;
  const check = () => {
    if (image === imageElement.value && image.complete && image.naturalWidth > 0) handleLoad();
  };
  completionTimer = setInterval(check, 100);
  check();
}, { flush: 'post' });

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function resetState() {
  clearRetryTimer();
  attempt.value = 0;
  loaded.value = false;
  hiddenUntilRetry.value = false;
  usingFallback.value = false;
}

function scheduleRetry() {
  if (!props.src || retryTimer) {
    return;
  }

  const canRetry = props.retryWhile || attempt.value < props.maxRetries;
  if (!canRetry) {
    return;
  }

  retryTimer = setTimeout(() => {
    retryTimer = null;
    hiddenUntilRetry.value = false;
    attempt.value += 1;
  }, props.retryDelayMs);
}

function handleLoad() {
  clearCompletionTimer();
  clearRetryTimer();
  loaded.value = true;
}

function handleError() {
  clearCompletionTimer();
  loaded.value = false;

  if (!usingFallback.value && props.fallbackSrc && props.fallbackSrc !== props.src) {
    clearRetryTimer();
    attempt.value = 0;
    hiddenUntilRetry.value = false;
    usingFallback.value = true;
    return;
  }

  const canRetry = props.retryWhile || attempt.value < props.maxRetries;
  if (!canRetry) {
    hiddenUntilRetry.value = true;
    return;
  }

  hiddenUntilRetry.value = true;
  scheduleRetry();
}

watch(() => [props.src, props.fallbackSrc] as const, resetState);
watch(
  () => props.retryWhile,
  (retryWhile) => {
    if (retryWhile && hiddenUntilRetry.value) {
      scheduleRetry();
    }
  }
);

onBeforeUnmount(() => { clearRetryTimer(); clearCompletionTimer(); });
</script>

<style scoped>
.image-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  color: var(--color-muted, #888);
  font-size: 0.875rem;
}
</style>

<template>
  <span class="mobile-media-share">
    <a v-if="!supportsSharing" class="media-action" :href="url" download :aria-label="t(downloadLabel ?? 'post.viewer.downloadOriginalFile')" :title="t(downloadLabel ?? 'post.viewer.downloadOriginalFile')"><span class="i-fluent-arrow-download-20-regular w-6 h-6" aria-hidden="true" /></a>
    <button v-else type="button" class="media-action" :disabled="loading" :aria-label="label" :title="label" @click="share">
      <span v-if="cinema" class="i-fluent-share-20-regular w-6 h-6" aria-hidden="true" />
      <svg v-else class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="isAndroid"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.7 7.6-4.4m-7.6 7 7.6 4.4"/></template>
        <path v-else d="M12 15V3m-4 4 4-4 4 4M8 11H5v10h14V11h-3"/>
      </svg>
      <span v-if="loading" class="mobile-media-share__ready" role="status">{{ t('post.viewer.preparingShare') }}</span>
      <span v-else-if="ready" class="mobile-media-share__ready">{{ t('post.viewer.shareReady') }}</span>
    </button>
    <span v-if="error" role="status">{{ t('post.viewer.shareFailed') }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
const props = defineProps<{ url: string; downloadLabel?: string; cinema?: boolean }>();
const { t } = useI18n();
const isAndroid = /Android/i.test(navigator.userAgent);
const supportsSharing = ref(Boolean(typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'photo.jpg', { type: 'image/jpeg' })] })));
const loading = ref(false);
const ready = ref(false);
const error = ref(false);
let file: File | null = null;
const label = computed(() => t(loading.value ? 'post.viewer.preparingShare' : 'post.viewer.shareFile'));
watch(() => props.url, () => { file = null; ready.value = false; error.value = false; });
function download(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.click();
}
async function share() {
  if (loading.value) return;
  const url = props.url;
  error.value = false;
  if (!navigator.share || !navigator.canShare) { download(url); return; }
  try {
    if (!file) {
      loading.value = true;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Media unavailable');
      const blob = await response.blob();
      if (url !== props.url) return;
      const disposition = response.headers.get('Content-Disposition');
      const name = disposition?.match(/filename="([^"\r\n]+)"/i)?.[1] ?? `${props.cinema ? 'media' : 'photo'}.${blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'}`;
      file = new File([blob], name, { type: blob.type });
    }
    if (!navigator.canShare({ files: [file] })) { supportsSharing.value = false; download(url); return; }
    // Fetching may outlast Safari's user activation. A second tap shares the ready file.
    ready.value = true;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    await navigator.share({ files: [file] });
    ready.value = false;
  } catch (cause) {
    if (url !== props.url) return;
    const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : '';
    if (name === 'AbortError') { ready.value = false; return; }
    if (file && name === 'NotAllowedError') { ready.value = true; return; }
    supportsSharing.value = false;
    ready.value = false;
    error.value = true;
  } finally { loading.value = false; }
}
</script>

<style scoped>
.mobile-media-share { display: none; }
@media (max-width: 767px) {
  .mobile-media-share { display: inline-flex; align-items: center; gap: .4rem; }
  .mobile-media-share__ready { font-size: .75rem; }
}
</style>

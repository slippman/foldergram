<template>
  <span ref="root" class="mobile-media-share">
    <a v-if="!supportsSharing" class="media-action" :href="url" download :aria-label="t(downloadLabel ?? 'post.viewer.downloadOriginalFile')" :title="t(downloadLabel ?? 'post.viewer.downloadOriginalFile')"><span class="i-fluent-arrow-download-20-regular w-6 h-6" aria-hidden="true" /></a>
    <button v-else type="button" class="media-action" :disabled="loading || sharing" :aria-label="label" :title="label" @click="share">
      <span v-if="cinema" class="i-fluent-share-20-regular w-6 h-6" aria-hidden="true" />
      <svg v-else class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="isAndroid"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.7 7.6-4.4m-7.6 7 7.6 4.4"/></template>
        <path v-else d="M12 15V3m-4 4 4-4 4 4M8 11H5v10h14V11h-3"/>
      </svg>
      <span v-if="loading && !cinema" class="mobile-media-share__ready" role="status">{{ preparingLabel }}</span>
      <span v-else-if="ready && !sharing && !cinema" class="mobile-media-share__ready">{{ t('post.viewer.shareReady') }}</span>
    </button>
    <span v-if="cinema && (loading || ready) && !sharing" class="mobile-media-share__progress" :class="{ 'mobile-media-share__progress--ready': ready }" tabindex="-1" role="group" :aria-label="ready ? t('post.viewer.shareReady') : preparingLabel">
      <span role="status">{{ ready ? t('post.viewer.shareReady') : `${preparingLabel} ${progressLabel}` }}</span>
      <span class="mobile-media-share__track" :class="{ 'mobile-media-share__track--indeterminate': !ready && !totalBytes }"
        role="progressbar" :aria-label="preparingLabel" :aria-valuenow="ready ? 100 : totalBytes > 0 ? progressPercent : undefined" aria-valuemin="0" aria-valuemax="100">
        <span class="mobile-media-share__fill" :style="{ width: `${ready ? 100 : totalBytes > 0 ? progressPercent : 35}%` }" />
      </span>
      <span class="mobile-media-share__popup-actions">
        <button v-if="ready" type="button" class="mobile-media-share__confirm" @click="share">{{ t('post.viewer.shareReady') }}</button>
        <button type="button" @click="cancelPreparation">{{ t('common.cancel') }}</button>
      </span>
    </span>
    <span v-if="cinema && blocked" class="mobile-media-share__progress mobile-media-share__blocked" role="group" :aria-label="t('post.viewer.videoShareUnavailable')">
      <strong>{{ t('post.viewer.videoShareUnavailable') }}</strong>
      <span role="status">{{ t(blocked === 'large' ? 'post.viewer.videoShareTooLarge' : blocked === 'unknown' ? 'post.viewer.videoShareSizeUnknown' : 'post.viewer.videoShareUnsupported', { limit: MAX_VIDEO_SHARE_MB }) }}</span>
      <span class="mobile-media-share__popup-actions">
        <a class="mobile-media-share__download" :href="url" download @click="cancelPreparation">{{ t(downloadLabel ?? 'post.viewer.download') }}</a>
        <button type="button" @click="cancelPreparation">{{ t('common.cancel') }}</button>
      </span>
    </span>
    <span v-if="cinema && busy && videoShare.active.value" class="mobile-media-share__progress mobile-media-share__busy" role="group" :aria-label="t('post.viewer.videoShareInProgress')">
      <span role="status">{{ t('post.viewer.videoShareInProgress') }}</span>
      <span class="mobile-media-share__popup-actions">
        <button type="button" @click="jumpToShare">{{ t('post.viewer.jumpToVideoShare') }}</button>
        <button type="button" @click="busy = false">{{ t('common.cancel') }}</button>
      </span>
    </span>
    <span v-if="error" role="status">{{ failureLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCinemaVideoShare } from '../composables/useCinemaVideoShare';
const props = defineProps<{ url: string; downloadLabel?: string; cinema?: boolean; mediaType?: 'image' | 'video' }>();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const busy = ref(false);
const videoShare = useCinemaVideoShare(() => {
  const target = root.value?.querySelector<HTMLElement>('.mobile-media-share__progress') ?? root.value;
  target?.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  target?.focus({ preventScroll: true });
});
function jumpToShare() {
  videoShare.active.value?.jump();
  busy.value = false;
}
watch(videoShare.active, active => { if (!active) busy.value = false; });
const isAndroid = /Android/i.test(navigator.userAgent);
function canShareFiles() {
  try {
    const video = props.cinema && props.mediaType === 'video';
    return Boolean(typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([''], video ? 'video.mp4' : 'photo.jpg', { type: video ? 'video/mp4' : 'image/jpeg' })] }));
  } catch { return false; }
}
const supportsSharing = ref(canShareFiles());
// 250 MB ceiling confirmed by Seth after testing. Device and destination
// limits still apply; this is not a guarantee that native sharing accepts it.
const MAX_VIDEO_SHARE_MB = 250;
const MAX_VIDEO_SHARE_BYTES = MAX_VIDEO_SHARE_MB * 1_000_000;
const isLimitedVideo = computed(() => props.cinema && props.mediaType === 'video');
const blocked = ref<'large' | 'unknown' | 'unsupported' | null>(null);
const loading = ref(false);
const ready = ref(false);
const sharing = ref(false);
const error = ref(false);
const timedOut = ref(false);
const transferred = ref(0);
const totalBytes = ref(0);
let file: File | null = null;
let generation = 0;
let controller: AbortController | null = null;
let stallTimer: ReturnType<typeof setTimeout> | undefined;
let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
const preparingLabel = computed(() => t(props.cinema && props.mediaType === 'video' ? 'post.viewer.preparingVideo' : 'post.viewer.preparingShare'));
const failureLabel = computed(() => t(props.cinema && timedOut.value ? 'post.viewer.shareTimedOut' : props.cinema && props.mediaType === 'video' ? 'post.viewer.shareVideoFailed' : 'post.viewer.shareFailed'));
const label = computed(() => loading.value ? preparingLabel.value : t(props.cinema && props.mediaType === 'video' ? 'post.viewer.shareVideo' : 'post.viewer.shareFile'));
const progressPercent = computed(() => totalBytes.value > 0 ? Math.min(100, Math.floor(transferred.value / totalBytes.value * 100)) : 0);
const progressLabel = computed(() => totalBytes.value > 0
  ? `${progressPercent.value}%`
  : transferred.value > 0 ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(transferred.value / 1024 / 1024)} MB` : '');
function clearTimers() { clearTimeout(stallTimer); clearTimeout(deadlineTimer); }
function cancelPreparation() {
  videoShare.release();
  busy.value = false;
  generation++;
  blocked.value = null;
  file = null;
  controller?.abort();
  controller = null;
  clearTimers();
  loading.value = false;
  sharing.value = false;
  ready.value = false;
}
watch(() => [props.url, props.mediaType, props.cinema] as const, () => {
  cancelPreparation(); file = null; error.value = false; timedOut.value = false; supportsSharing.value = canShareFiles();
});
onBeforeUnmount(cancelPreparation);
function download(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = '';
  link.click();
}
function shareFilename(disposition: string | null, mimeType: string) {
  // Content-Disposition permits quoted filenames, tokens, and UTF-8 filename*.
  let name: string | undefined;
  const encoded = disposition?.match(/filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i)?.[1];
  if (encoded) {
    try { name = decodeURIComponent(encoded.trim()); } catch { /* Use filename below. */ }
  }
  if (!name) {
    const match = disposition?.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"\r\n]*)"|([^;\r\n]*))/i);
    name = (match?.[1] ?? match?.[2])?.trim();
  }
  name = name?.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g, '');
  if (name && name !== '.' && name !== '..') return name;
  const extensions: Record<string, string> = {
    'video/quicktime': 'mov', 'video/mp4': 'mp4', 'video/x-m4v': 'm4v',
    'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif'
  };
  const extension = extensions[mimeType.split(';')[0].trim().toLowerCase()] ?? 'bin';
  return `${props.cinema ? 'media' : 'photo'}.${extension}`;
}
function waitForTransfer<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  // Remove the abort listener after each read; a shared pending rejection promise
  // would otherwise retain a Promise.race reaction for every video chunk.
  return new Promise((resolve, reject) => {
    const aborted = () => {
      signal.removeEventListener('abort', aborted);
      reject(new DOMException('Preparation aborted', 'AbortError'));
    };
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(value => {
      signal.removeEventListener('abort', aborted);
      resolve(value);
    }, error => {
      signal.removeEventListener('abort', aborted);
      reject(error);
    });
    if (signal.aborted) aborted();
  });
}
function offerDownload(url: string) {
  supportsSharing.value = false;
  ready.value = false;
  file = null;
  // Preparing a file must never navigate the album. Safari can open a download
  // URL instead of saving it; Cinema leaves that action to an explicit user tap.
  if (!props.cinema) download(url);
}
function blockVideo(reason: 'large' | 'unknown' | 'unsupported', transfer: AbortController) {
  blocked.value = reason;
  ready.value = false;
  file = null;
  transfer.abort();
}
function responseSize(response: Response) {
  const raw = response.headers.get('Content-Length');
  if (!raw || response.headers.get('Content-Encoding')) return null;
  const size = Number(raw);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}
async function share() {
  if (loading.value || sharing.value) return;
  if (isLimitedVideo.value && !videoShare.claim()) { busy.value = true; return; }
  busy.value = false;
  const url = props.url;
  const run = ++generation;
  const preparingFile = !file;
  error.value = false;
  timedOut.value = false;
  blocked.value = null;
  if (!navigator.share || !navigator.canShare) { offerDownload(url); videoShare.release(); return; }
  const transfer = new AbortController();
  controller = transfer;
  let transferTimedOut = false;
  const expire = () => { transferTimedOut = true; transfer.abort(); };
  const touch = () => { clearTimeout(stallTimer); stallTimer = setTimeout(expire, 60000); };
  try {
    if (!file) {
      loading.value = true;
      transferred.value = 0;
      totalBytes.value = 0;
      touch();
      deadlineTimer = setTimeout(expire, 5 * 60000);
      if (isLimitedVideo.value) {
        // HEAD uses the same scoped URL/credentials, without buffering the movie.
        let head: Response;
        try {
          head = await waitForTransfer(fetch(url, { method: 'HEAD', signal: transfer.signal }), transfer.signal);
        } catch (cause) {
          if (run !== generation) return;
          if (transfer.signal.aborted) throw cause;
          blockVideo('unknown', transfer);
          return;
        }
        if (run !== generation) return;
        touch();
        const size = head.ok ? responseSize(head) : null;
        if (size === null) { blockVideo('unknown', transfer); return; }
        if (size > MAX_VIDEO_SHARE_BYTES) { blockVideo('large', transfer); return; }
        const mime = head.headers.get('Content-Type')?.split(';')[0].trim();
        if (mime && !navigator.canShare({ files: [new File([], shareFilename(head.headers.get('Content-Disposition'), mime), { type: mime })] })) {
          blockVideo('unsupported', transfer);
          return;
        }
      }
      const response = await waitForTransfer(fetch(url, { signal: transfer.signal }), transfer.signal);
      if (!response.ok) throw new Error('Media unavailable');
      if (isLimitedVideo.value && (responseSize(response) ?? 0) > MAX_VIDEO_SHARE_BYTES) {
        blockVideo('large', transfer);
        void response.body?.cancel().catch(() => {});
        return;
      }
      touch();
      // Content-Length may describe compressed bytes; use MB if the decoded length is unknown.
      const length = Number(response.headers.get('Content-Length'));
      if (!response.headers.get('Content-Encoding') && Number.isFinite(length) && length > 0) totalBytes.value = length;
      let blob: Blob;
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        try {
          while (true) {
            const { done, value } = await waitForTransfer(reader.read(), transfer.signal);
            if (done) break;
            if (run !== generation) return;
            if (isLimitedVideo.value && transferred.value + value.byteLength > MAX_VIDEO_SHARE_BYTES) {
              blockVideo('large', transfer);
              chunks.length = 0;
              return;
            }
            chunks.push(value.buffer instanceof ArrayBuffer
              ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
              : new Uint8Array(value));
            transferred.value += value.byteLength;
            touch();
          }
        } finally {
          // Cancellation releases the response body as well as the fetch request.
          if (transfer.signal.aborted || run !== generation) void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        blob = new Blob(chunks, { type: response.headers.get('Content-Type') ?? '' });
        chunks.length = 0;
      } else {
        if (isLimitedVideo.value) { blockVideo('unknown', transfer); return; }
        blob = await waitForTransfer(response.blob(), transfer.signal);
      }
      if (run !== generation) return;
      clearTimers();
      const disposition = response.headers.get('Content-Disposition');
      const name = shareFilename(disposition, blob.type);
      file = new File([blob], name, { type: blob.type });
    }
    if (run !== generation) return;
    loading.value = false;
    if (!navigator.canShare({ files: [file] })) {
      if (isLimitedVideo.value) blockVideo('unsupported', transfer);
      else offerDownload(url);
      return;
    }
    // Fetching may outlast Safari's user activation. A second tap shares the ready file.
    ready.value = true;
    if ((props.cinema && preparingFile) || (navigator.userActivation && !navigator.userActivation.isActive)) return;
    sharing.value = true;
    await navigator.share({ files: [file] });
    if (run === generation) { ready.value = false; if (props.cinema) file = null; }
  } catch (cause) {
    if (run !== generation) return;
    const name = cause && typeof cause === 'object' && 'name' in cause ? cause.name : '';
    if (blocked.value) return;
    if (name === 'AbortError' && !transferTimedOut) { ready.value = false; if (props.cinema) file = null; return; }
    if (file && name === 'NotAllowedError') { ready.value = true; return; }
    timedOut.value = transferTimedOut;
    supportsSharing.value = false;
    ready.value = false;
    error.value = true;
    if (props.cinema) file = null;
  } finally {
    if (run === generation) {
      clearTimers(); controller = null; loading.value = false; sharing.value = false;
      if (!ready.value) videoShare.release();
    }
  }
}

</script>

<style scoped>
.mobile-media-share { display: none; position: relative; }
.mobile-media-share__progress { position: absolute; z-index: 65; bottom: calc(100% + 0.4rem); right: 0; display: grid; gap: 0.5rem; width: max-content; max-width: min(16rem, 80vw); padding: 0.7rem; border: 1px solid var(--border); border-radius: 0.6rem; background: var(--surface); color: var(--text); font-size: 0.8rem; }
.mobile-media-share__track { display: block; height: 4px; min-width: 10rem; overflow: hidden; border-radius: 999px; background: var(--border); }
.mobile-media-share__fill { display: block; height: 100%; border-radius: inherit; background: #eab308; transition: width 0.15s ease; }
.mobile-media-share__progress--ready .mobile-media-share__fill { background: #22c55e; }
.mobile-media-share__track--indeterminate .mobile-media-share__fill { animation: share-progress 1.4s ease-in-out infinite alternate; }
.mobile-media-share__popup-actions { display: flex; gap: 0.5rem; }
.mobile-media-share__progress .mobile-media-share__confirm { background: #15803d; border-color: #15803d; color: #fff; }
@keyframes share-progress { from { transform: translateX(0); } to { transform: translateX(180%); } }
@media (prefers-reduced-motion: reduce) { .mobile-media-share__track--indeterminate .mobile-media-share__fill { animation: none; } }
.mobile-media-share__progress button, .mobile-media-share__download { width: auto; height: auto; padding: 0.3rem 0.5rem; border: 1px solid var(--border); border-radius: 0.35rem; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; text-decoration: none; }
.mobile-media-share__blocked { max-width: min(19rem, 80vw); }
.mobile-media-share__busy .mobile-media-share__popup-actions { flex-wrap: wrap; }
@media (max-width: 767px) {
  .mobile-media-share { display: inline-flex; align-items: center; gap: .4rem; }
  .mobile-media-share__ready { font-size: .75rem; }
}
</style>

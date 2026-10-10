<template>
  <article ref="postElement" class="cinema-post">
    <div class="cinema-post__media" :style="mediaStyle">
      <CarouselMediaStage v-if="isCarousel" :items="item.mediaItems!" v-model="carouselIndex" prefer-preview fit-container
        :retry-while="appStore.isScanning" :autoplay="isVisible" :muted="videoMuted"
        @toggle-mute="toggleMute" @autoplay-muted="releaseAudio" />
      <VideoMediaPlayer v-else-if="item.mediaType === 'video'" :src="item.previewUrl"
        :poster="item.thumbnailUrl" :original-url="media?.originalUrl"
        :playback-strategy="media?.playbackStrategy" :width="item.width" :height="item.height"
        :alt="item.caption || ''" :muted="videoMuted" :autoplay="isVisible" :loop="false" load="visible"
        @toggle-mute="toggleMute" @autoplay-muted="releaseAudio" />
      <ResilientImage v-else :src="item.previewUrl" :fallback-src="media?.originalUrl"
        :alt="item.caption || ''" :width="item.width" :height="item.height" loading="lazy"
        :retry-while="appStore.isScanning" />
    </div>
    <footer class="cinema-post__details" :style="{ width: mediaStyle.width }">
      <p v-if="item.caption?.trim()" class="cinema-post__caption">{{ item.caption }}</p>
      <div class="cinema-post__toolbar">
        <div class="cinema-post__actions">
          <button v-if="authStore.canUseSavedItems" type="button" class="media-action"
            :class="{ 'media-action--liked': likesStore.isLiked(item.id) }"
            :aria-label="likeLabel" :title="likeLabel" :aria-pressed="likesStore.isLiked(item.id)"
            :disabled="likesStore.isPending(item.id)" @click="likesStore.toggleLike(item)">
            <span class="w-[1.45rem] h-[1.45rem]" :class="likesStore.isLiked(item.id) ? 'i-fluent-heart-20-filled' : 'i-fluent-heart-20-regular'" aria-hidden="true" />
          </button>
          <button type="button" class="media-action" :aria-expanded="showInfo" :aria-controls="infoId"
            :aria-label="infoLabel" :title="infoLabel" @click="toggleInfo">
            <span class="i-fluent-info-20-regular w-[1.45rem] h-[1.45rem]" aria-hidden="true" />
          </button>
        </div>
        <div class="cinema-post__metadata">
          <RouterLink v-if="showAlbumName" class="cinema-post__album" :to="{ name: 'folder', params: { slug: item.folderSlug } }">
            {{ item.folderName }}
            <span class="i-fluent-chevron-right-16-regular cinema-post__album-chevron" aria-hidden="true" />
          </RouterLink>

          <time v-if="captureDate" :datetime="captureDate.toISOString()">{{ formattedDate }}</time>
          <RouterLink v-if="item.place" :to="{ name: 'place', params: { slug: item.place.slug } }">{{ item.place.name }}</RouterLink>
        </div>
        <div class="cinema-post__actions">
          <button v-if="authStore.canManageLibrary" type="button" class="media-action"
            :aria-label="t('post.viewer.editCaption')" :title="t('post.viewer.editCaption')" @click="openCaptionEditor">
            <span class="i-fluent-edit-16-regular w-5 h-5" aria-hidden="true" />
          </button>
          <a class="media-action" :href="downloadUrl" download
            :aria-label="t('post.viewer.downloadOriginalFile')" :title="t('post.viewer.downloadOriginalFile')">
            <svg class="w-[1.45rem] h-[1.45rem]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4.75v9.5m0 0 3.5-3.5M12 14.25l-3.5-3.5M5.75 16.75v1.5A1.75 1.75 0 0 0 7.5 20h9a1.75 1.75 0 0 0 1.75-1.75v-1.5"
                fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
            </svg>
          </a>
        </div>
      </div>
      <section v-if="showInfo" :id="infoId" class="cinema-post__info">
        <p v-if="loadingInfo">{{ t('common.loading') }}</p>
        <p v-else-if="infoError" role="alert">{{ infoError }}</p>
        <dl v-else>
          <div><dt>{{ t('post.viewer.stats.dimensions') }}</dt><dd>{{ activeMedia?.width ?? item.width }} × {{ activeMedia?.height ?? item.height }}</dd></div>
          <div v-if="detail"><dt>{{ t('post.viewer.stats.type') }}</dt><dd>{{ activeMedia?.mimeType ?? detail.mimeType }}</dd></div>
          <div v-if="detail"><dt>{{ t('post.viewer.stats.size') }}</dt><dd>{{ formattedFileSize }}</dd></div>
          <div><dt>{{ t('folder.cinema.filename') }}</dt><dd>{{ activeMedia?.filename ?? item.filename }}</dd></div>
        </dl>
      </section>
    </footer>
    <PostCaptionModal v-if="editingCaption" :filename="item.filename" :caption="item.caption"
      :use-filename-fallback="false" :error="error" :loading="saving"
      @cancel="editingCaption = false" @save="save" />
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CarouselMediaStage from './CarouselMediaStage.vue';
import VideoMediaPlayer from './VideoMediaPlayer.vue';
import ResilientImage from './ResilientImage.vue';
import PostCaptionModal from './PostCaptionModal.vue';
import { useCinemaAudio } from '../composables/useCinemaAudio';
import { useImageCaptionEditor } from '../composables/useImageCaptionEditor';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useLikesStore } from '../stores/likes';
import { fetchImage } from '../api/gallery';
import { getOriginalMediaDownloadUrl } from '../utils/original-media';
import type { FeedItem, ImageDetail } from '../types/api';

const props = defineProps<{ item: FeedItem; showAlbumName?: boolean }>();
const appStore = useAppStore();
const authStore = useAuthStore();
const likesStore = useLikesStore();
const { t, locale } = useI18n();
const { saving, error, saveCaption, clearError } = useImageCaptionEditor();
const editingCaption = ref(false);
const carouselIndex = ref(0);
const showInfo = ref(false);
const loadingInfo = ref(false);
const infoError = ref<string | null>(null);
const detail = ref<ImageDetail | null>(null);
const infoId = computed(() => `cinema-info-${props.item.id}`);
const activeMedia = computed(() => detail.value?.mediaItems?.[carouselIndex.value] ?? props.item.mediaItems?.[carouselIndex.value]);
const downloadUrl = computed(() => getOriginalMediaDownloadUrl(activeMedia.value?.imageId ?? props.item.id));
const likeLabel = computed(() => likesStore.toggleAriaLabel(likesStore.isLiked(props.item.id)));
const infoLabel = computed(() => t(showInfo.value ? 'post.viewer.hideDetails' : 'post.viewer.showDetails'));
const formattedFileSize = computed(() => {
  const bytes = activeMedia.value?.fileSize ?? detail.value?.fileSize ?? 0;
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB';
});
async function toggleInfo() {
  showInfo.value = !showInfo.value;
  if (!showInfo.value || detail.value || loadingInfo.value) return;
  loadingInfo.value = true;
  infoError.value = null;
  try { detail.value = await fetchImage(props.item.id); }
  catch (error) { infoError.value = error instanceof Error ? error.message : t('folder.cinema.infoError'); }
  finally { loadingInfo.value = false; }
}
const isVisible = ref(false);
const audiblePostId = useCinemaAudio();
const videoMuted = computed(() => audiblePostId.value !== props.item.id);
function releaseAudio() {
  if (audiblePostId.value === props.item.id) audiblePostId.value = null;
}
function toggleMute() {
  if (videoMuted.value) audiblePostId.value = props.item.id;
  else releaseAudio();
}
const postElement = ref<HTMLElement | null>(null);
const media = computed(() => props.item.mediaItems?.[0]);
const isCarousel = computed(() => props.item.postType === 'carousel' && (props.item.mediaItems?.length ?? 0) > 1);
// Fit complete media within the viewport while using the available width.
const mediaStyle = computed(() => {
  const ratio = props.item.width > 0 && props.item.height > 0 ? props.item.width / props.item.height : 1;
  return { aspectRatio: String(ratio), width: `min(100%, calc((100dvh - 6rem) * ${ratio}))` };
});
// Do not present indexing or upload times as capture dates.
const captureDate = computed(() => {
  if (props.item.takenAtSource !== 'exif' || props.item.takenAt === null || !Number.isFinite(props.item.takenAt)) return null;
  const date = new Date(props.item.takenAt);
  return Number.isFinite(date.getTime()) ? date : null;
});
const formattedDate = computed(() => captureDate.value ? new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium', timeStyle: 'short'
}).format(captureDate.value) : '');

function openCaptionEditor() {
  clearError();
  editingCaption.value = true;
}
async function save(caption: string | null) {
  try {
    await saveCaption(props.item, caption);
    editingCaption.value = false;
  } catch {
    // The caption dialog displays the save error and preserves the draft.
  }
}
let observer: IntersectionObserver | null = null;
onMounted(() => {
  if (!postElement.value || typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(async ([entry]) => {
    isVisible.value = entry.isIntersecting;
    if (!isVisible.value) releaseAudio();
    await nextTick();
    postElement.value?.querySelectorAll('media-player').forEach(element => {
      const player = element as HTMLElement & { play?: () => Promise<void>; pause?: () => void };
      if (isVisible.value) {
        player.play?.()?.catch(() => {});
      } else {
        player.pause?.();
      }
    });
  });
  observer.observe(postElement.value);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  releaseAudio();
});
</script>

<style scoped>
.cinema-post__metadata .cinema-post__album {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  flex-basis: 100%;
  max-width: 100%;
  color: var(--text);
  font-size: 0.8rem;
  font-weight: 500;
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: 0.2rem;
}
.cinema-post__album-chevron { flex-shrink: 0; width: 0.85rem; height: 0.85rem; }
.cinema-post__metadata .cinema-post__album:hover { color: var(--text); text-decoration-color: currentColor; }
.cinema-post__album:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
.cinema-post__metadata:has(.cinema-post__album) { row-gap: 0.25rem; }
.cinema-post { scroll-margin-top: 3.75rem; margin: 0 0 3rem; color: var(--text); }
.cinema-post__media { margin: 0 auto; max-height: calc(100dvh - 6rem); background: var(--surface-alt); }
.cinema-post__media :deep(img), .cinema-post__media :deep(video) { width: 100%; height: 100%; object-fit: contain; }
.cinema-post__details { margin: 0 auto; text-align: center; padding: 0.6rem 0 0; }
.cinema-post__caption { margin: 0 0 0.35rem; font-size: 0.9rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.cinema-post__metadata { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 0.85rem; color: var(--muted); font-size: 0.75rem; }
.cinema-post__metadata a { color: inherit; text-decoration: none; }
.cinema-post__metadata a:hover { color: var(--text); }
.cinema-post__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; }
.cinema-post__actions { display: flex; align-items: center; gap: 0.65rem; }
.cinema-post__info { margin: 0.5rem auto 0; padding: 0.75rem; max-width: 36rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; text-align: left; }
.cinema-post__info dl { margin: 0; display: grid; gap: 0.35rem; }
.cinema-post__info dl div { display: flex; justify-content: space-between; gap: 1rem; }
.cinema-post__info dt { color: var(--muted); }
.cinema-post__info dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
@media (max-width: 767px) {
  .cinema-post { margin-bottom: 1.5rem; }
  .cinema-post__metadata { gap: 0.4rem; font-size: 0.7rem; }
}
</style>

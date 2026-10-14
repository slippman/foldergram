<template>
  <article ref="postElement" class="cinema-post" :data-album-poster="item.mediaType === 'video' ? item.thumbnailUrl : undefined">
    <div class="cinema-post__media" :style="mediaStyle">
      <CarouselMediaStage v-if="isCarousel" :items="item.mediaItems!" v-model="carouselIndex" prefer-preview fit-container
        :retry-while="appStore.isScanning" :autoplay="isVisible" :muted="videoMuted"
        @toggle-mute="toggleMute" @autoplay-muted="releaseAudio" @click="openCarouselPhoto" />
      <VideoMediaPlayer v-else-if="item.mediaType === 'video'" :src="item.previewUrl"
        :poster="item.thumbnailUrl" :original-url="media?.originalUrl"
        :playback-strategy="media?.playbackStrategy" :width="item.width" :height="item.height"
        :alt="item.caption || ''" :muted="videoMuted" :autoplay="isVisible" :loop="false" load="visible"
        @toggle-mute="toggleMute" @autoplay-muted="releaseAudio" />
      <RouterLink v-else custom :to="photoRoute" v-slot="{ href, navigate }">
        <a class="cinema-post__photo" :href="href" :aria-label="t('folder.cinema.openPhoto')" @click="openPhoto($event, navigate)">
      <ResilientImage show-loading :src="item.previewUrl" :fallback-src="media?.originalUrl"
        :alt="item.caption || ''" :width="item.width" :height="item.height" loading="lazy"
        :retry-while="appStore.isScanning" />
        </a>
      </RouterLink>
    </div>
    <footer class="cinema-post__details" :style="{ width: mediaStyle.width }">
      <div class="cinema-post__toolbar">
        <div class="cinema-post__actions">
          <SharedFavoriteButton v-if="sharedSlug" :slug="sharedSlug" :id="item.id" />
          <button v-if="!sharedSlug && authStore.canUseSavedItems" type="button" class="media-action"
            :class="{ 'media-action--liked': likesStore.isLiked(item.id) }"
            :aria-label="likeLabel" :title="likeLabel" :aria-pressed="likesStore.isLiked(item.id)"
            :disabled="likesStore.isPending(item.id)" @click="likesStore.toggleLike(item)">
            <span class="w-[1.45rem] h-[1.45rem]" :class="likesStore.isLiked(item.id) ? 'i-fluent-heart-20-filled' : 'i-fluent-heart-20-regular'" aria-hidden="true" />
          </button>
          <button type="button" class="media-action" :aria-expanded="showInfo" :aria-controls="infoId"
            :aria-label="infoLabel" :title="infoLabel" @click="toggleInfo">
            <span class="i-fluent-info-20-regular w-[1.45rem] h-[1.45rem]" aria-hidden="true" />
          </button>
          <RouterLink v-if="(route.name === 'folder' || sharedSlug || item.postType === 'carousel') && (activeMedia?.mediaType ?? item.mediaType) === 'image'" custom :to="photoRoute" v-slot="{ href, navigate }">
            <a class="media-action cinema-post__zoom" :class="{ 'cinema-post__zoom--carousel': item.postType === 'carousel' }" :href="href" :aria-label="t('folder.cinema.openPhoto')"
              :title="t('folder.cinema.openPhoto')" @click="openPhoto($event, navigate)">
              <span class="i-fluent-zoom-in-20-regular w-[1.45rem] h-[1.45rem]" aria-hidden="true" />
            </a>
          </RouterLink>
        </div>
        <div class="cinema-post__actions">
          <button v-if="!sharedSlug && authStore.canManageLibrary" type="button" class="media-action"
            :aria-label="t('post.viewer.editCaption')" :title="t('post.viewer.editCaption')" @click="openCaptionEditor">
            <span class="i-fluent-edit-16-regular w-5 h-5" aria-hidden="true" />
          </button>
          <MobileMediaShare cinema :media-type="activeMedia?.mediaType ?? item.mediaType" :url="downloadUrl" :download-label="sharedSlug ? 'post.viewer.download' : undefined" />
          <a class="media-action photo-download-desktop" :href="downloadUrl" download
            :aria-label="sharedSlug ? t('post.viewer.download') : t('post.viewer.downloadOriginalFile')" :title="sharedSlug ? t('post.viewer.download') : t('post.viewer.downloadOriginalFile')">
            <span class="i-fluent-arrow-download-20-regular w-6 h-6" aria-hidden="true" />
          </a>
        </div>
      </div>
      <p v-if="item.caption?.trim()" class="cinema-post__caption">{{ item.caption }}</p>
      <div v-if="showAlbumName || captureDate || (!sharedSlug && item.place)" class="cinema-post__metadata">
        <RouterLink v-if="showAlbumName" class="cinema-post__album" :to="{ name: sharedSlug ? 'shared-folder' : 'folder', params: { slug: sharedSlug || item.folderSlug } }">
          {{ item.folderName }}
          <span class="i-fluent-chevron-right-16-regular cinema-post__album-chevron" aria-hidden="true" />
        </RouterLink>

        <time v-if="captureDate" :datetime="captureDate.toISOString()">{{ formattedDate }}</time>
        <RouterLink v-if="!sharedSlug && item.place" :to="{ name: 'place', params: { slug: item.place.slug } }">{{ item.place.name }}</RouterLink>
      </div>
      <section v-if="showInfo" :id="infoId" class="cinema-post__info">
        <p v-if="loadingInfo">{{ t('common.loading') }}</p>
        <p v-else-if="infoError" role="alert">{{ infoError }}</p>
        <dl v-else>
          <div v-if="!sharedSlug && authStore.canManageLibrary" class="cinema-post__filename"><dt>{{ t('folder.cinema.filename') }}</dt><dd>{{ activeMedia?.filename ?? detail?.filename ?? item.filename }}</dd></div>
          <div><dt>{{ t('post.viewer.stats.dimensions') }}</dt><dd>{{ activeMedia?.width ?? item.width }} × {{ activeMedia?.height ?? item.height }}</dd></div>
          <div v-if="detail"><dt>{{ t('post.viewer.stats.type') }}</dt><dd>{{ activeMedia?.mimeType ?? detail.mimeType }}</dd></div>
          <div v-if="detail"><dt>{{ t('post.viewer.stats.size') }}</dt><dd>{{ formattedFileSize }}</dd></div>
          <div v-for="entry in exifDetails" :key="entry.label"><dt>{{ entry.label }}</dt><dd>{{ entry.value }}</dd></div>
        </dl>
      </section>
    </footer>
    <PostCaptionModal v-if="editingCaption" :filename="item.filename" :caption="item.caption"
      :use-filename-fallback="false" :error="error" :loading="saving"
      @cancel="editingCaption = false" @save="save" />
  </article>
</template>

<script setup lang="ts">
import { formatExifDetails } from '../utils/media-details';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
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
import { fetchImage, fetchSharedPost } from '../api/gallery';
import SharedFavoriteButton from './SharedFavoriteButton.vue';
import MobileMediaShare from './MobileMediaShare.vue';
import { getOriginalMediaDownloadUrl, getSharedOriginalMediaDownloadUrl } from '../utils/original-media';
import { sharedImageDetail } from '../utils/shared-media';
import type { FeedItem, ImageDetail } from '../types/api';

const props = defineProps<{ item: FeedItem; showAlbumName?: boolean; sharedSlug?: string }>();
const appStore = useAppStore();
const route = useRoute();
const router = useRouter();
const photoRoute = computed(() => ({
  name: props.sharedSlug ? 'shared-post' : 'image', params: props.sharedSlug ? { slug: props.sharedSlug, id: String(props.item.id) } : { id: String(props.item.id) },
  query: activeMedia.value ? { media: String(activeMedia.value.imageId) } : {}
}));
function openCarouselPhoto(event: MouseEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('img')) return;
  openPhoto(event, () => { void router.push(photoRoute.value); });
}
function openPhoto(event: MouseEvent, navigate: () => void) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  appStore.setImageModalBackground(route.fullPath);
  navigate();
}
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
const exifDetails = computed(() => formatExifDetails(activeMedia.value?.exif ?? detail.value?.exif, t));
const downloadUrl = computed(() => {
  const id = activeMedia.value?.imageId ?? props.item.id;
  return props.sharedSlug ? getSharedOriginalMediaDownloadUrl(id) : getOriginalMediaDownloadUrl(id);
});
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
  try { detail.value = props.sharedSlug ? sharedImageDetail(await fetchSharedPost(props.item.id)) : await fetchImage(props.item.id); }
  catch (error) { infoError.value = error instanceof Error ? error.message : t('folder.cinema.infoError'); }
  finally { loadingInfo.value = false; }
}
const isInViewport = ref(false);
const albumReady = ref(!document.getElementById('fg-splash'));
const markAlbumReady = () => { albumReady.value = true; };
const markAlbumLoading = () => { albumReady.value = false; };
const isVisible = computed(() => albumReady.value && isInViewport.value && route.name !== 'image' && route.name !== 'shared-post');
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
// Leave room for the header, controls, and a glimpse of the next item.
const mediaStyle = computed(() => {
  const ratio = props.item.width > 0 && props.item.height > 0 ? props.item.width / props.item.height : 1;
  return { aspectRatio: String(ratio), width: `min(100%, calc((var(--cinema-viewport-height) - var(--cinema-viewport-reserve)) * ${ratio}))` };
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
watch(isVisible, async (visible) => {
  if (!visible) releaseAudio();
  await nextTick();
  postElement.value?.querySelectorAll('media-player').forEach(element => {
    const player = element as HTMLElement & { muted: boolean; play?: () => Promise<void>; pause?: () => void };
    if (visible) {
      // Apply mute before explicitly starting playback after the loading screen.
      // Vidstack may still have its default state when Vue's prop is unchanged.
      player.muted = videoMuted.value;
      player.play?.()?.catch(() => {});
    }
    else player.pause?.();
  });
});
let observer: IntersectionObserver | null = null;
onMounted(() => {
  window.addEventListener('foldergram:album-ready', markAlbumReady);
  window.addEventListener('foldergram:album-view-loading', markAlbumLoading);
  if (!postElement.value || typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver(([entry]) => {
    isInViewport.value = entry.isIntersecting && entry.intersectionRatio >= 0.5;
    if (!isVisible.value) releaseAudio();
  }, { threshold: [0, 0.5] });
  const mediaElement = postElement.value.querySelector('.cinema-post__media');
  if (mediaElement) observer.observe(mediaElement);
});
onBeforeUnmount(() => {
  window.removeEventListener('foldergram:album-ready', markAlbumReady);
  window.removeEventListener('foldergram:album-view-loading', markAlbumLoading);
  observer?.disconnect();
  releaseAudio();
});
</script>

<style scoped>
.cinema-post__metadata .cinema-post__album {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.25rem;
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
.cinema-post { --cinema-viewport-height: 100dvh; --cinema-viewport-reserve: 17rem; scroll-margin-top: 3.75rem; margin: 0 0 2.25rem; color: var(--text); }
.cinema-post__media { margin: 0 auto; max-height: calc(var(--cinema-viewport-height) - var(--cinema-viewport-reserve)); background: var(--surface-alt); }
.cinema-post__media :deep(img), .cinema-post__media :deep(video) { width: 100%; height: 100%; object-fit: contain; }
.cinema-post__photo { position: relative; display: block; width: 100%; height: 100%; cursor: zoom-in; }
.cinema-post__photo:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
.cinema-post__details { margin: 0 auto; text-align: left; padding: 0.25rem 0 0.25rem; border-bottom: 1px solid var(--border); }
.cinema-post__caption { margin: 0 0 0.2rem; font-size: 0.9rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.cinema-post__metadata { display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; color: var(--muted); font-size: 0.75rem; }
.cinema-post__metadata time { white-space: nowrap; }
.cinema-post__metadata a { color: inherit; text-decoration: none; }
.cinema-post__metadata a:hover { color: var(--text); }
.cinema-post__toolbar { margin-bottom: 0.2rem; display: flex; align-items: center; justify-content: space-between; gap: 0.65rem; }
.cinema-post__actions { display: flex; align-items: center; gap: 0.65rem; }
.cinema-post__info { margin: 0.5rem auto 0; padding: 0.75rem; max-width: 36rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; font-size: 0.75rem; text-align: left; }
.cinema-post__info dl { margin: 0; display: grid; gap: 0.35rem; }
.cinema-post__info dl div { display: flex; justify-content: space-between; gap: 1rem; }
.cinema-post__info dt { color: var(--muted); }
.cinema-post__info dd { margin: 0; overflow-wrap: anywhere; min-width: 0; }
.cinema-post__zoom { display: none; }
.cinema-post__zoom--carousel { display: inline-flex; }
@media (max-width: 767px) {
  .cinema-post__zoom { display: inline-flex; }
  /* Keep Safari toolbar changes from resizing the scrollable album. */
  .cinema-post { --cinema-viewport-height: 100svh; --cinema-viewport-reserve: 20rem; }
  .cinema-post__metadata { font-size: 0.7rem; }
}
</style>

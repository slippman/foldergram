<template>
  <section :data-album-theme="isCinema ? 'cinema' : viewerImage || shareStore.imageError ? 'classic' : 'unknown'" :data-album-state="shareStore.imageError ? 'settled' : viewerImage && !shareStore.loadingImage ? 'ready' : 'loading'" v-if="isCinema" class="shared-cinema-viewer">
    <ErrorState v-if="shareStore.imageError" :title="t('share.postErrorTitle')" :message="shareStore.imageError" />
    <PostViewer ref="postViewer" v-else-if="viewerImage" :image="viewerImage" :folder="viewerFolder" :shared-slug="slug" cinema is-modal @close="close" />
    <div v-else aria-busy="true" />
  </section>
  <main :data-album-theme="isCinema ? 'cinema' : viewerImage || shareStore.imageError ? 'classic' : 'unknown'" :data-album-state="shareStore.imageError ? 'settled' : viewerImage && !shareStore.loadingImage ? 'ready' : 'loading'" v-else class="min-h-screen bg-bg px-5 py-6 text-text sm:px-8 sm:py-8">
    <section class="mx-auto grid w-full max-w-[72rem] gap-5">
      <RouterLink
        class="inline-flex w-fit items-center gap-2 rounded-[0.8rem] border border-border bg-surface px-3 py-2 text-[0.86rem] font-semibold text-text no-underline hover:bg-surface-hover"
        :to="{ name: 'shared-folder', params: { slug }, query: isCinema ? { view: 'scroll', photo: id } : {} }"
      >
        <span class="i-fluent-chevron-left-20-regular h-5 w-5" aria-hidden="true" />
        {{ t('share.backToFolder') }}
      </RouterLink>

      <ErrorState v-if="shareStore.imageError" :title="t('share.postErrorTitle')" :message="shareStore.imageError" />

      <section v-else-if="shareStore.image" class="relative">
        <RouterLink
          v-if="shareStore.image.previousImageId"
          class="shared-post-nav shared-post-nav--previous"
          :to="{ name: 'shared-post', params: { slug, id: String(shareStore.image.previousImageId) }, query: isCinema ? { cinema: '1' } : {} }"
          :aria-label="t('post.viewer.previous')"
        >
          <span class="i-fluent-chevron-left-20-regular h-5 w-5" aria-hidden="true" />
        </RouterLink>
        <RouterLink
          v-if="shareStore.image.nextImageId"
          class="shared-post-nav shared-post-nav--next"
          :to="{ name: 'shared-post', params: { slug, id: String(shareStore.image.nextImageId) }, query: isCinema ? { cinema: '1' } : {} }"
          :aria-label="t('post.viewer.next')"
        >
          <span class="i-fluent-chevron-right-20-regular h-5 w-5" aria-hidden="true" />
        </RouterLink>

        <article class="grid overflow-hidden rounded-[1rem] border border-border bg-surface shadow-[var(--shadow)] lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="grid min-h-[24rem] place-items-center bg-black">
            <CarouselMediaStage
              v-if="isCarousel"
              v-model="carouselIndex"
              class="max-h-[78vh] w-full"
              :items="shareStore.image.mediaItems!"
              prefer-preview
              loading="eager"
            />
            <video
              v-else-if="shareStore.image.mediaType === 'video'"
              class="max-h-[78vh] w-full bg-black"
              :src="shareStore.image.previewUrl"
              :poster="shareStore.image.thumbnailUrl"
              :data-album-poster="shareStore.image.thumbnailUrl"
              controls
              playsinline
            />
            <ResilientImage
              v-else
              class="max-h-[78vh] w-full object-contain"
              :src="shareStore.image.previewUrl"
              :alt="shareStore.image.filename"
            />
          </div>
          <aside v-if="!isCinema" class="grid content-start gap-4 p-5">
            <div class="grid gap-1">
              <h1 class="m-0 text-[1.05rem] font-semibold tracking-[-0.02em]">{{ shareStore.image.folderName }}</h1>
              <p class="m-0 break-words text-[0.9rem] text-muted">{{ resolveDisplayCaption(shareStore.image) }}</p>
            </div>
            <dl class="grid gap-3 text-[0.88rem]">
              <div class="grid gap-1">
                <dt class="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">{{ t('post.viewer.stats.dimensions') }}</dt>
                <dd class="m-0 font-semibold">{{ activeMedia?.width ?? shareStore.image.width }} x {{ activeMedia?.height ?? shareStore.image.height }}</dd>
              </div>
              <div v-if="activeMedia?.durationMs ?? shareStore.image.durationMs" class="grid gap-1">
                <dt class="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">{{ t('post.viewer.stats.duration') }}</dt>
                <dd class="m-0 font-semibold">{{ formatMediaDuration(activeMedia?.durationMs ?? shareStore.image.durationMs) }}</dd>
              </div>
              <div class="grid gap-1">
                <dt class="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-muted">{{ t('post.viewer.stats.type') }}</dt>
                <dd class="m-0 font-semibold">{{ activeMedia?.mimeType ?? shareStore.image.mimeType }}</dd>
              </div>
            </dl>
          </aside>
        </article>
      </section>

      <section v-else class="mx-auto grid w-[min(100%,28rem)] gap-3 rounded-[1rem] border border-border bg-surface p-7 text-center">
        <p class="m-0 text-muted">{{ t('common.loading') }}</p>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import PostViewer from '../components/PostViewer.vue';
import { sharedImageDetail } from '../utils/shared-media';
import ErrorState from '../components/ErrorState.vue';
import CarouselMediaStage from '../components/CarouselMediaStage.vue';
import ResilientImage from '../components/ResilientImage.vue';
import { useShareStore } from '../stores/share';
import { resolveDisplayCaption } from '../utils/caption';
import { formatMediaDuration } from '../utils/media';

const postViewer = ref<InstanceType<typeof PostViewer> | null>(null);

const props = defineProps<{
  slug: string;
  id: string;
  modal?: boolean;
}>();

const { t } = useI18n();
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const route = useRoute();
const shareStore = useShareStore();
const isCinema = computed(() => (shareStore.image?.folderSlug === props.slug ? shareStore.image.displayTheme : shareStore.folder?.slug === props.slug ? shareStore.folder.displayTheme : 'classic') === 'cinema');
watch(() => [isCinema.value, props.slug, props.id] as const, ([cinema]) => {
  if (cinema) window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
}, { immediate: true, flush: 'post' });
const lastDisplayedImage = ref<ReturnType<typeof sharedImageDetail> | null>(null);
watch(() => shareStore.image, (image) => {
  if (image?.folderSlug === props.slug && image.id === Number(props.id)) lastDisplayedImage.value = sharedImageDetail(image);
}, { immediate: true });
const viewerImage = computed(() => {
  if (!shareStore.loadingImage && shareStore.image?.folderSlug === props.slug && shareStore.image.id === Number(props.id)) {
    return sharedImageDetail(shareStore.image);
  }
  return isCinema.value && shareStore.loadingImage && lastDisplayedImage.value?.folderSlug === props.slug
    ? lastDisplayedImage.value : null;
});
const viewerFolder = computed(() => shareStore.folder?.slug === props.slug && shareStore.folder ? { ...shareStore.folder, folderPath: '', breadcrumb: null, latestImageMtimeMs: null, avatarImageId: null, avatarUrl: shareStore.folder.avatarThumbnailUrl } : null);
function handleEscape(event: KeyboardEvent) {
  if (props.modal || !isCinema.value || event.key !== 'Escape' || event.defaultPrevented) return;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  event.preventDefault();
  close();
}
onMounted(() => window.addEventListener('keydown', handleEscape));
onUnmounted(() => window.removeEventListener('keydown', handleEscape));
function close() {
  if (props.modal) { emit('close'); return; }
  void router.replace({ name: 'shared-folder', params: { slug: props.slug }, query: isCinema.value ? { view: 'scroll', photo: props.id } : {} });
}
const imageId = computed(() => Number(props.id));
const carouselIndex = ref(0);
const isCarousel = computed(() => shareStore.image?.postType === 'carousel' && (shareStore.image.mediaItems?.length ?? 0) > 1);
const activeMedia = computed(() => isCarousel.value ? shareStore.image?.mediaItems?.[carouselIndex.value] ?? null : null);

async function loadImage() {
  postViewer.value?.pause?.();
  carouselIndex.value = 0;
  if (Number.isFinite(imageId.value)) {
    await shareStore.loadImage(imageId.value, undefined, { legacyImageAlias: route.name === 'shared-image' });
  }
}

watch(() => [props.slug, imageId.value] as const, loadImage, { immediate: true });
</script>

<style scoped>
.shared-cinema-viewer { width: 100%; height: 100dvh; }
.shared-cinema-viewer :deep(.viewer) { width: 100%; }
.shared-post-nav {
  position: fixed;
  top: 50%;
  z-index: 20;
  display: inline-flex;
  width: 2.4rem;
  height: 2.4rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #111;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
  transform: translateY(-50%);
}

.shared-post-nav--previous {
  left: 0.75rem;
}

.shared-post-nav--next {
  right: 0.75rem;
}
</style>

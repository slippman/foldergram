<template>
  <div :data-album-theme="viewerTheme" :data-album-state="viewerStore.error ? 'settled' : activeImage && !viewerStore.loading ? 'ready' : 'loading'" :class="['image-view', modal ? 'image-view--modal' : 'image-view--page', { 'image-view--standalone-cinema': cinema && !props.modal }]" @click.stop>
    <ErrorState v-if="viewerStore.error" title="Could not load post" :message="viewerStore.error" />
    <PostViewer
      ref="postViewer"
      v-else-if="activeImage"
      :image="activeImage"
      :folder="folder"
      :is-modal="modal"
      :cinema="cinema"
      :deleting="viewerStore.deleting"
      :loading="viewerStore.loading"
      @close="closeViewer"
      @delete="openDeleteDialog"
    />
    <div v-else-if="viewerStore.loading && !cinema" class="card p-8 text-center">
      <p class="text-muted">Loading post...</p>
    </div>
    <ConfirmDialog
      v-if="confirmDeleteOpen"
      title="Delete this post?"
      :message="deleteDialogMessage"
      :confirm-label="deleteDialogConfirmLabel"
      :loading="viewerStore.deleting"
      @cancel="confirmDeleteOpen = false"
      @confirm="handleDelete"
    >
      <template #details>
        <label class="flex items-start gap-3 mt-3 cursor-pointer select-none">
          <input
            v-model="deleteOriginalFromDisk"
            class="mt-[0.2rem]"
            type="checkbox"
            :disabled="viewerStore.deleting"
          />
          <span class="grid gap-[0.18rem]">
            <span class="text-[0.92rem] font-semibold text-text">Also permanently delete original file from disk</span>
            <span class="text-[0.84rem] text-muted">Keep this unchecked to move the post to Trash while keeping the source file on disk.</span>
          </span>
        </label>
        <p
          v-if="deleteOriginalFromDisk"
          class="m-0 mt-3 px-3 py-[0.8rem] rounded-[0.9rem] border border-[rgba(217,48,37,0.24)] text-[0.84rem] text-[#b42318] bg-[rgba(217,48,37,0.08)]"
        >
          This will permanently delete the original file, thumbnail, and preview from disk. This action cannot be undone.
        </p>
        <p
          v-if="deleteError"
          class="m-0 mt-3 px-3 py-[0.8rem] rounded-[0.9rem] border border-[rgba(217,48,37,0.24)] text-[0.84rem] text-[#b42318] bg-[rgba(217,48,37,0.08)]"
        >
          {{ deleteError }}
        </p>
      </template>
    </ConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ConfirmDialog from '../components/ConfirmDialog.vue';
import ErrorState from '../components/ErrorState.vue';
import PostViewer from '../components/PostViewer.vue';
import type { ImageDetail } from '../types/api';
import { useAppStore } from '../stores/app';
import { useFeedStore } from '../stores/feed';
import { useLikesStore } from '../stores/likes';
import { useFoldersStore } from '../stores/folders';
import { useMomentsStore } from '../stores/moments';
import { useViewerStore } from '../stores/viewer';

const postViewer = ref<InstanceType<typeof PostViewer> | null>(null);

const props = withDefaults(defineProps<{
  id: string;
  modal?: boolean;
  cinema?: boolean;
}>(), { cinema: undefined });

const emit = defineEmits<{
  close: [];
}>();

const appStore = useAppStore();
// Until preferences arrive, retain the server's explicit Cinema selection.
const cinema = computed(() => props.cinema ?? (appStore.stats
  ? appStore.folderDisplayTheme === 'cinema'
  : document.documentElement.dataset.cinemaEntry === 'true'));
const viewerTheme = computed(() => props.cinema === undefined && !appStore.stats && !appStore.error && !viewerStore.error
  ? 'unknown' : cinema.value ? 'cinema' : 'classic');
const modal = computed(() => props.modal || cinema.value);
function closeViewer() {
  postViewer.value?.pause?.();
  if (props.modal) emit('close');
  else if (viewerStore.image) void router.replace({ name: 'folder', params: { slug: viewerStore.image.folderSlug } });
  else void router.replace({ name: 'home' });
}

const feedStore = useFeedStore();
const likesStore = useLikesStore();
const viewerStore = useViewerStore();
const foldersStore = useFoldersStore();
const momentsStore = useMomentsStore();
const route = useRoute();
const router = useRouter();
function handleStandaloneEscape(event: KeyboardEvent) {
  if (props.modal || !cinema.value || event.key !== 'Escape' || event.defaultPrevented) return;
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
  event.preventDefault();
  closeViewer();
}
onMounted(() => window.addEventListener('keydown', handleStandaloneEscape));
onUnmounted(() => window.removeEventListener('keydown', handleStandaloneEscape));
const confirmDeleteOpen = ref(false);
const deleteTarget = ref<Pick<ImageDetail, 'id' | 'mediaType'> | null>(null);
const deleteOriginalFromDisk = ref(false);
const deleteError = ref<string | null>(null);

const imageId = computed(() => Number(props.id));
const activeMediaType = computed(() => (route.query.tab === 'reels' ? 'video' : undefined));
const lastDisplayedImage = ref<ImageDetail | null>(null);
watch(() => viewerStore.image, (image) => {
  if (image?.id === imageId.value) lastDisplayedImage.value = image;
}, { immediate: true });
const activeImage = computed(() =>
  viewerStore.image?.id === imageId.value
    ? viewerStore.image
    : cinema.value && viewerStore.loading ? lastDisplayedImage.value : null
);
const folder = computed(() =>
  activeImage.value ? foldersStore.items.find((entry) => entry.slug === activeImage.value?.folderSlug) ?? null : null
);
const deleteDialogMessage = computed(() =>
  deleteOriginalFromDisk.value
    ? 'This will permanently delete the post from the app and remove original media from disk.'
    : 'This will delete the post from the app and move it to Trash. The original file will stay on disk unless you choose permanent deletion.'
);
const deleteDialogConfirmLabel = computed(() => (deleteOriginalFromDisk.value ? 'Permanently Delete' : 'Delete'));

async function loadImage() {
  postViewer.value?.pause?.();
  if (Number.isFinite(imageId.value)) {
    await viewerStore.loadImage(imageId.value, activeMediaType.value);
  }
}

watch(() => [imageId.value, activeMediaType.value] as const, loadImage, { immediate: true });
watch(() => [cinema.value, imageId.value] as const, ([cinema]) => {
  if (cinema) window.dispatchEvent(new CustomEvent('foldergram:album-view-loading', { detail: { defer: true } }));
}, { immediate: true, flush: 'post' });

function openDeleteDialog() {
  if (!activeImage.value) return;
  deleteTarget.value = { id: activeImage.value.id, mediaType: activeImage.value.mediaType };
  deleteOriginalFromDisk.value = false;
  deleteError.value = null;
  confirmDeleteOpen.value = true;
}

async function handleDelete() {
  if (!confirmDeleteOpen.value || !deleteTarget.value || viewerStore.deleting) {
    return;
  }

  const currentImage = deleteTarget.value;
  deleteError.value = null;

  try {
    const deleted = await viewerStore.deleteImage(currentImage.id, {
      permanent: deleteOriginalFromDisk.value
    });
    confirmDeleteOpen.value = false;
    deleteOriginalFromDisk.value = false;

    feedStore.removeImage(deleted.id);
    likesStore.removeImage(deleted.id);
    const removedFolder = foldersStore.removeImage(deleted.id, deleted.folderSlug, currentImage.mediaType);
    momentsStore.removeImage(deleted.id);
    appStore.removeIndexedImage(removedFolder ? 1 : 0, currentImage.mediaType);

    if (props.modal) {
      emit('close');
      return;
    }

    if (removedFolder) {
      await router.replace({ name: 'library' });
      return;
    }

    await router.replace({ name: 'folder', params: { slug: deleted.folderSlug } });
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : 'Unable to delete post';
  }
}
</script>

<style scoped>
.image-view.image-view--standalone-cinema {
  position: fixed;
  inset: 0;
  z-index: 100;
  width: 100%;
  background: #000;
}

.image-view {
  width: min(100%, 72rem);
}

.image-view--modal {
  display: flex;
  justify-content: center;
  min-height: 0;
  height: 100%;
  max-height: 100%;
}

.image-view--page {
  margin: 0 auto;
}
</style>

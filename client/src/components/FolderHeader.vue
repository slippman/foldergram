<template>
  <section class="grid gap-3 pb-3">
    <AlbumHeader :title="displayFolderTitle">
      <template #actions>
        <button v-if="!shared && hasAvatarStory" type="button" class="media-action" :aria-label="t('folder.header.openStories')" @click="emit('openAvatarStory')">
          <span class="i-fluent-play-circle-24-regular h-5 w-5" aria-hidden="true" />
        </button>
        <button
          v-if="!shared && authStore.canManageLibrary"
          type="button"
          class="inline-flex items-center justify-center px-4 pt-2 pb-1.5 text-[0.75rem] font-semibold leading-none rounded-lg bg-surface-hover text-text hover:bg-border transition-colors border border-border cursor-pointer"
          @click="openProfileEditor"
        >
          {{ t('folder.header.editButton') }}
        </button>
        <button
          v-if="!shared && authStore.canManageLibrary"
          type="button"
          class="inline-flex h-[2.1rem] w-[2.1rem] items-center justify-center rounded-lg border border-border bg-surface-hover text-text transition-colors hover:bg-border"
          :aria-label="t('folder.header.shareButton')"
          :title="t('folder.header.shareButton')"
          @click="openShareModal"
        >
          <span class="i-fluent-share-20-regular h-5 w-5" aria-hidden="true" />
        </button>
      </template>
    </AlbumHeader>
    <div class="grid gap-3">
      <div class="flex items-center gap-[1.6rem] flex-wrap text-[0.95rem] leading-none max-sm:justify-center">
        <span>{{ t('folder.header.posts', { count: folder.imageCount }) }}</span>
        <span>{{ t('folder.header.reels', { count: folder.videoCount }) }}</span>
        <span v-if="!shared && folder.latestImageMtimeMs">{{ t('folder.header.updated', { date: formattedUpdatedDate }) }}</span>
      </div>
      <div v-if="!shared" class="grid max-w-[29rem] gap-[0.28rem] max-sm:max-w-none">
        <span class="text-[0.74rem] font-bold tracking-[0.1em] text-muted uppercase">{{ t('folder.header.libraryPath') }}</span>
        <p class="m-0 font-mono text-[0.8rem] leading-[1.5] text-muted break-all">{{ folder.folderPath }}</p>
      </div>
      <div v-if="folder.description" class="max-w-[34rem] pt-[0.25rem]">
        <div class="flex items-start gap-[0.35rem]">
          <p
            :id="descriptionId"
            ref="descriptionElement"
            :class="[
              'm-0 text-[0.95rem] leading-[1.4] whitespace-pre-wrap',
              { 'folder-description--collapsed': !isDescriptionExpanded }
            ]"
          >
            {{ folder.description }}
          </p>
          <button
            v-if="isDescriptionOverflowing"
            class="inline-flex items-center justify-center mt-[0.05rem] w-6 h-6 p-0 border-0 rounded-full bg-transparent text-muted cursor-pointer transition-colors hover:text-text"
            type="button"
            :aria-expanded="isDescriptionExpanded"
            :aria-controls="descriptionId"
            :aria-label="isDescriptionExpanded ? t('folder.header.collapseDescription') : t('folder.header.expandDescription')"
            @click="isDescriptionExpanded = !isDescriptionExpanded"
          >
            <span
              :class="isDescriptionExpanded ? 'i-fluent-chevron-up-16-regular' : 'i-fluent-chevron-down-16-regular'"
              class="w-4 h-4"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>

    <Teleport v-if="!shared" to="body">
      <FolderProfileModal
        v-if="isEditingProfile"
        :initial-name="folder.name"
        :initial-description="folder.description"
        :error="profileError"
        :loading="savingProfile"
        @cancel="closeProfileEditor"
        @save="handleSaveProfile"
      />
      <FolderShareModal
        v-if="isSharingFolder"
        :folder="folder"
        @cancel="closeShareModal"
      />
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FolderSummary } from '../types/api';
import { formatFolderTitle } from '../utils/folder-titles';
import AlbumHeader from './AlbumHeader.vue';
import FolderProfileModal from './FolderProfileModal.vue';
import FolderShareModal from './FolderShareModal.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useFoldersStore } from '../stores/folders';

const props = defineProps<{
  folder: FolderSummary;
  hasAvatarStory?: boolean;
  shared?: boolean;
}>();

const emit = defineEmits<{
  openAvatarStory: [];
}>();

const appStore = useAppStore();
const authStore = useAuthStore();
const foldersStore = useFoldersStore();
const { locale, t } = useI18n();

const isEditingProfile = ref(false);
const isSharingFolder = ref(false);
const savingProfile = ref(false);
const profileError = ref<string | null>(null);
const descriptionElement = ref<HTMLElement | null>(null);
const isDescriptionExpanded = ref(false);
const isDescriptionOverflowing = ref(false);
const descriptionId = `folder-description-${Math.random().toString(36).slice(2, 10)}`;

let descriptionResizeObserver: ResizeObserver | null = null;
let syncingDescriptionOverflow = false;

const displayFolderTitle = computed(() => props.shared ? props.folder.name : formatFolderTitle(props.folder, appStore.nestedFolderTitleFormat));
const formattedUpdatedDate = computed(() =>
  props.folder.latestImageMtimeMs
    ? new Date(props.folder.latestImageMtimeMs).toLocaleDateString(locale.value, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : ''
);

async function handleSaveProfile(data: { name: string; description: string | null }) {
  try {
    savingProfile.value = true;
    profileError.value = null;
    await foldersStore.updateFolderProfile(props.folder.slug, data.name, data.description);
    closeProfileEditor();
  } catch (error) {
    profileError.value = error instanceof Error ? error.message : t('folder.header.errors.updateProfile');
  } finally {
    savingProfile.value = false;
  }
}

function openProfileEditor() {
  profileError.value = null;
  isEditingProfile.value = true;
}

function closeProfileEditor() {
  profileError.value = null;
  isEditingProfile.value = false;
}

function openShareModal() {
  isSharingFolder.value = true;
}

function closeShareModal() {
  isSharingFolder.value = false;
}

function disconnectDescriptionObserver() {
  if (!descriptionResizeObserver) {
    return;
  }

  descriptionResizeObserver.disconnect();
  descriptionResizeObserver = null;
}

function observeDescriptionElement() {
  disconnectDescriptionObserver();

  if (!descriptionElement.value || !props.folder.description) {
    return;
  }

  descriptionResizeObserver = new ResizeObserver(() => {
    if (syncingDescriptionOverflow) {
      return;
    }

    void syncDescriptionOverflow();
  });
  descriptionResizeObserver.observe(descriptionElement.value);
}

async function syncDescriptionOverflow() {
  await nextTick();

  const element = descriptionElement.value;
  if (!element) {
    isDescriptionOverflowing.value = false;
    return;
  }

  syncingDescriptionOverflow = true;

  element.classList.add('folder-description--measure');
  const isOverflowing = element.scrollHeight > element.clientHeight + 1;
  element.classList.remove('folder-description--measure');

  isDescriptionOverflowing.value = isOverflowing;
  if (!isOverflowing) {
    isDescriptionExpanded.value = false;
  }

  syncingDescriptionOverflow = false;
}

watch(
  () => props.folder.slug,
  async () => {
    isDescriptionExpanded.value = false;
    await nextTick();
    observeDescriptionElement();
    void syncDescriptionOverflow();
  },
  { immediate: true }
);

watch(
  () => props.folder.description,
  async () => {
    await nextTick();
    observeDescriptionElement();
    void syncDescriptionOverflow();
  }
);

watch(descriptionElement, () => {
  observeDescriptionElement();
  void syncDescriptionOverflow();
});

onMounted(() => {
  observeDescriptionElement();
  void syncDescriptionOverflow();
});

onBeforeUnmount(() => {
  disconnectDescriptionObserver();
});
</script>

<style scoped>
.folder-description--collapsed,
.folder-description--measure {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
</style>

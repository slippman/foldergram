<template>
        <section class="grid gap-2 rounded-[1rem] border border-border bg-surface-alt p-4">
          <label class="grid gap-2 text-[0.84rem] font-semibold">
            {{ t('folder.shareModal.visibilityTitle') }}
            <select v-model="shareMode" class="min-h-11 rounded-[0.75rem] border border-border bg-surface px-3 text-text" :disabled="savingShareMode" @change="saveShareMode">
              <option value="library">{{ t('folder.shareModal.visibilityLibrary') }}</option>
              <option value="link-only">{{ t('folder.shareModal.visibilityLinkOnly') }}</option>
            </select>
          </label>
          <p class="m-0 text-[0.8rem] leading-relaxed text-muted">{{ t(shareMode === 'link-only' ? 'folder.shareModal.visibilityLinkOnlyDescription' : 'folder.shareModal.visibilityLibraryDescription') }}</p>
        </section>
  <p v-if="localError" class="m-0 px-4 py-3 text-[0.84rem] text-rose-700 dark:text-rose-300" role="alert">{{ localError }}</p>
  <p v-if="localNotice" class="m-0 px-4 py-3 text-[0.84rem] text-muted" role="status">{{ localNotice }}</p>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFoldersStore } from '../stores/folders';
import type { FolderSummary } from '../types/api';

const props = defineProps<{ folder: FolderSummary }>();
const foldersStore = useFoldersStore();
const { t } = useI18n();
const localError = ref<string | null>(null);
const localNotice = ref<string | null>(null);
const shareMode = ref(props.folder.shareMode ?? 'library');
const savedShareMode = ref(shareMode.value);
const savingShareMode = ref(false);
watch(() => props.folder, folder => { shareMode.value = savedShareMode.value = folder.shareMode ?? 'library'; });
async function saveShareMode() {
  if (savingShareMode.value) return;
  savingShareMode.value = true;
  localError.value = null;
  localNotice.value = null;
  try {
    const updated = await foldersStore.updateShareMode(props.folder.slug, shareMode.value);
    savedShareMode.value = shareMode.value = updated.shareMode ?? 'library';
    localNotice.value = t('folder.shareModal.visibilitySaved');
  } catch (error) {
    shareMode.value = savedShareMode.value;
    localError.value = error instanceof Error ? error.message : t('folder.shareModal.visibilityFailed');
  } finally { savingShareMode.value = false; }
}
</script>

<template>
  <div class="cinema-viewer-actions" data-swipe-ignore="true" data-sheet-swipe-ignore="true" @keydown.esc="handleEscape">
    <SharedFavoriteButton v-if="sharedSlug" :slug="sharedSlug" :id="image.id" />
    <button v-else-if="auth.canUseSavedItems" class="media-action" :class="{ 'media-action--liked': likes.isLiked(image.id) }"
      :aria-label="likes.toggleAriaLabel(likes.isLiked(image.id))" :aria-pressed="likes.isLiked(image.id)"
      :disabled="likes.isPending(image.id)" @click="likes.toggleLike(image)">
      <span aria-hidden="true" :class="likes.isLiked(image.id) ? 'i-fluent-heart-20-filled' : 'i-fluent-heart-20-regular'" />
    </button>
    <CollectionBookmark v-if="!sharedSlug" :item="image" placement="viewer" />
    <MobileMediaShare cinema :media-type="mediaType ?? image.mediaType" :url="downloadUrl" :download-label="sharedSlug ? 'post.viewer.download' : undefined" />
    <button class="media-action cinema-viewer-actions__desktop" :aria-label="t('post.viewer.shareLink')" :title="t('post.viewer.shareLink')" @click="shareLink">
      <span aria-hidden="true" class="i-fluent-share-20-regular" />
    </button>
    <a class="media-action photo-download-desktop" :href="downloadUrl" download :aria-label="t('post.viewer.download')" :title="t('post.viewer.download')">
      <span aria-hidden="true" class="i-fluent-arrow-download-20-regular" />
    </a>
    <details v-if="!sharedSlug && (auth.canManageLibrary || auth.canDeleteMedia)" ref="menu" class="cinema-viewer-actions__admin">
      <summary class="media-action" :aria-label="t('nav.more')" :title="t('nav.more')">
        <span aria-hidden="true" class="i-fluent-more-horizontal-20-regular" />
      </summary>
      <div class="cinema-viewer-actions__menu">
        <button v-if="auth.canManageLibrary" @click="act('edit')"><span aria-hidden="true" class="i-fluent-edit-20-regular" />{{ t('post.viewer.editCaption') }}</button>
        <button v-if="auth.canManageLibrary" :disabled="settingCover || isCurrentCover" @click="act('cover')"><span aria-hidden="true" class="i-fluent-folder-add-20-regular" />{{ t('post.viewer.setAsCover') }}</button>
        <button v-if="auth.canDeleteMedia" class="cinema-viewer-actions__delete" :disabled="deleting" @click="act('delete')"><span aria-hidden="true" class="i-fluent-delete-20-regular" />{{ t('post.viewer.deletePost') }}</button>
      </div>
    </details>
    <span v-if="notice" class="cinema-viewer-actions__notice" role="status">{{ notice }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ImageDetail } from '../types/api';
import { useAuthStore } from '../stores/auth';
import { useLikesStore } from '../stores/likes';
import SharedFavoriteButton from './SharedFavoriteButton.vue';
import CollectionBookmark from './CollectionBookmark.vue';
import MobileMediaShare from './MobileMediaShare.vue';
const props = defineProps<{ image: ImageDetail; sharedSlug?: string; downloadUrl: string; settingCover: boolean; isCurrentCover: boolean; deleting?: boolean; mediaType?: 'image' | 'video' }>();
const emit = defineEmits<{ edit: []; cover: []; delete: [] }>();
const { t } = useI18n();
const auth = useAuthStore();
const likes = useLikesStore();
const menu = ref<HTMLDetailsElement>();
const notice = ref('');
function closeMenu() { if (menu.value?.open) { menu.value.open = false; menu.value.querySelector('summary')?.focus(); } }
function handleEscape(event: KeyboardEvent) { if (menu.value?.open) { event.preventDefault(); event.stopPropagation(); closeMenu(); } }
function act(action: 'edit' | 'cover' | 'delete') { closeMenu(); if (action === 'edit') emit('edit'); else if (action === 'cover') emit('cover'); else emit('delete'); }
function outside(event: PointerEvent) { if (event.target instanceof Node && !menu.value?.contains(event.target) && menu.value) menu.value.open = false; }
async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    return;
  } catch {
    const previousFocus = document.activeElement;
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.append(textArea);
    textArea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Copy failed');
    } finally {
      textArea.remove();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }
  }
}
async function shareLink() {
  notice.value = '';
  try {
    if (navigator.share) await navigator.share({ url: window.location.href });
    else { await copyLink(window.location.href); notice.value = t('folder.shareModal.notices.linkCopied'); }
  } catch (error) {
    if (!(error instanceof Error && error.name === 'AbortError')) notice.value = t('folder.shareModal.copyLinkError');
  }
}
watch(() => props.image.id, () => { if (menu.value) menu.value.open = false; notice.value = ''; });
onMounted(() => document.addEventListener('pointerdown', outside));
onUnmounted(() => document.removeEventListener('pointerdown', outside));
</script>

<style scoped>
.cinema-viewer-actions { position: fixed; z-index: 60; right: max(0.75rem, env(safe-area-inset-right)); top: calc(max(0.75rem, env(safe-area-inset-top)) + 6.4rem); display: flex; flex-direction: column; gap: 0.3rem; }
.cinema-viewer-actions :deep(.media-action), .cinema-viewer-actions :deep(.collection-bookmark__button) { display: inline-flex; align-items: center; justify-content: center; width: 2.9rem; height: 2.9rem; padding: 0; border: 0; border-radius: 0.5rem; color: white; background: rgba(0,0,0,0.35); box-shadow: none; cursor: pointer; }
.cinema-viewer-actions :deep(.media-action:hover), .cinema-viewer-actions :deep(.collection-bookmark__button:hover) { background: rgba(0,0,0,0.6); }
.cinema-viewer-actions :deep(.media-action--liked) { color: #ff6b81; }
.cinema-viewer-actions :deep(.collection-bookmark__button--saved) { color: #80bdff; }
.cinema-viewer-actions :deep(.media-action > span) { width: 1.45rem; height: 1.45rem; }
.cinema-viewer-actions :deep(.mobile-media-share__ready) { position: absolute; right: 3.4rem; width: max-content; max-width: 14rem; padding: 0.5rem; background: var(--surface); color: var(--text); border-radius: 0.5rem; }
.cinema-viewer-actions summary { list-style: none; }
.cinema-viewer-actions summary::-webkit-details-marker { display: none; }
.cinema-viewer-actions__menu { position: absolute; right: 3.4rem; bottom: 0; display: grid; width: max-content; max-width: calc(100vw - 5rem); padding: 0.35rem; border: 1px solid var(--border); border-radius: 0.75rem; background: var(--surface); color: var(--text); box-shadow: 0 8px 32px #0003; }
.cinema-viewer-actions__menu button { display: flex; align-items: center; gap: 0.65rem; padding: 0.75rem; border: 0; border-radius: 0.4rem; text-align: left; background: transparent; color: inherit; cursor: pointer; font: inherit; font-size: 0.85rem; }
.cinema-viewer-actions__menu button:hover { background: var(--surface-alt); }
.cinema-viewer-actions__menu button:disabled { opacity: 0.45; cursor: default; }
.cinema-viewer-actions__menu button span { width: 1.25rem; height: 1.25rem; flex: none; }
.cinema-viewer-actions__menu .cinema-viewer-actions__delete { color: #d93025; }
.cinema-viewer-actions__notice { position: absolute; right: 3.4rem; top: 0; width: max-content; max-width: 14rem; padding: 0.6rem; border-radius: 0.5rem; background: var(--surface); color: var(--text); font-size: 0.85rem; }
@media (max-width: 767px) { .cinema-viewer-actions .cinema-viewer-actions__desktop { display: none; } }
</style>

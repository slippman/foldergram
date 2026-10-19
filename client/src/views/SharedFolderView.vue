<template>
  <main :data-album-theme="shareStore.folder ? (isCinema ? 'cinema' : 'classic') : shareStore.error || (shareStore.access && !shareStore.access.granted) ? 'classic' : 'unknown'" :data-album-state="shareStore.access?.granted && shareStore.folder ? 'ready' : isAccessPending || shareStore.loading || shareStore.unlocking ? 'loading' : 'settled'" class="min-h-screen bg-bg text-text" :class="isCinema ? 'px-2 pb-8 sm:px-4' : 'px-5 py-6 sm:px-8 sm:py-8'">
    <section class="mx-auto grid w-full" :class="isCinema ? 'min-w-0 max-w-[100rem] gap-3' : 'max-w-[66rem] gap-6'">
      <header v-if="!isCinema" class="flex items-center justify-between gap-4 border-b border-border pb-4">
        <RouterLink class="inline-flex items-center gap-2 text-text no-underline" :to="{ name: 'home' }">
          <span class="i-fluent-folder-24-filled h-6 w-6 text-accent" aria-hidden="true" />
          <span class="text-[1rem] font-semibold tracking-[-0.02em]">Foldergram</span>
        </RouterLink>
      </header>

      <section v-if="shareStore.access?.granted && shareStore.folder" class="grid" :class="isCinema ? 'mx-auto min-w-0 w-full gap-3' : 'gap-6'">
        <AlbumHeader v-if="isCinema" :title="displayFolderTitle"
          :back-to="isScroll ? { name: 'shared-folder', params: { slug } } : undefined"
          :back-label="t('share.albumOverview')"
          :hint="shareStore.images.length ? (isScroll ? 'scroll' : 'grid') : undefined" />
        <div v-else class="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-6 max-sm:grid-cols-1 max-sm:text-center">
          <div class="grid place-items-center">
            <Avatar class="h-[7.25rem] w-[7.25rem]" :name="displayFolderTitle" :src="shareStore.folder.avatarThumbnailUrl" />
          </div>
          <div class="grid gap-3">
            <h1 class="m-0 text-[clamp(1.6rem,3vw,2.15rem)] font-semibold tracking-[-0.04em]">{{ displayFolderTitle }}</h1>
            <p v-if="shareStore.folder.description" class="m-0 max-w-[36rem] whitespace-pre-wrap text-[0.96rem] leading-[1.45] text-muted max-sm:mx-auto">
              {{ shareStore.folder.description }}
            </p>
            <div class="flex flex-wrap gap-4 text-[0.92rem] text-muted max-sm:justify-center">
              <span>{{ t('folder.header.posts', { count: shareStore.folder.imageCount }) }}</span>
              <span>{{ t('folder.header.reels', { count: shareStore.folder.videoCount }) }}</span>
            </div>
          </div>
        </div>

        <EmptyState
          v-if="!shareStore.loading && shareStore.images.length === 0"
          title="No posts in this shared folder"
          description="This folder share is valid, but there are no visible posts right now."
        />
        <section v-else class="grid gap-5">
          <div v-if="isCinema && isScroll">
            <CinemaPost v-for="item in shareStore.images" :key="item.id" :id="`shared-photo-${item.id}`"
              :item="sharedFeedItem(item)" :shared-slug="slug" />
          </div>
          <FolderGrid v-else :items="shareStore.images" :variant="isCinema ? 'cinema' : 'posts'" :shared-slug="slug" />
          <InfiniteLoader :loading="shareStore.loading" :has-more="shareStore.hasMore" :show-complete="!isCinema" @load-more="loadMore" />
          <CinemaGuestTeaser v-if="isCinema && shareStore.images.length && !shareStore.hasMore && !shareStore.loading" />
        </section>
      </section>

      <section
        v-else-if="isAccessPending || shareStore.loading || shareStore.unlocking"
        :class="isCinema ? 'shared-album-loading' : 'mx-auto grid w-[min(100%,28rem)] gap-3 rounded-[1rem] border border-border bg-surface p-7 text-center'" :role="isCinema ? 'status' : undefined" :aria-live="isCinema ? 'polite' : undefined"
      >
        <template v-if="isCinema">
        <img class="shared-album-loading__logo" :src="'/branding/ur-logo-4e4dc1180945.png'" alt="" width="144" height="144" />
        <p class="m-0">{{ t('share.loadingAlbum') }}</p>
        <span class="shared-album-loading__indicator" aria-hidden="true" />
        </template>
        <template v-else>
          <p class="m-0 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-accent-strong">{{ t('share.loadingEyebrow') }}</p>
          <h1 class="m-0 text-[1.45rem] font-semibold tracking-[-0.04em]">{{ t('share.loadingTitle') }}</h1>
        </template>
      </section>

      <section
        v-else-if="shareStore.access?.hasPassword"
        class="mx-auto grid w-[min(100%,28rem)] gap-4 rounded-[1rem] border border-border bg-surface p-7"
      >
        <div class="grid gap-2 text-center">
          <p class="m-0 text-[0.78rem] font-bold uppercase tracking-[0.08em] text-accent-strong">{{ t('share.passwordEyebrow') }}</p>
          <h1 class="m-0 text-[1.45rem] font-semibold tracking-[-0.04em]">{{ t('share.passwordTitle') }}</h1>
          <p class="m-0 text-[0.88rem] leading-relaxed text-muted">
            {{ t(linkUnlockFailed ? 'share.passwordFallbackDescription' : 'share.passwordDescription') }}
          </p>
        </div>
        <form class="grid gap-3" @submit.prevent="unlockPassword">
          <label class="grid gap-[0.35rem] text-[0.85rem] font-semibold">
            {{ t('share.passwordLabel') }}
            <input
              v-model="password"
              class="min-h-11 rounded-[0.8rem] border border-border bg-bg px-3 text-text outline-none focus:border-text"
              type="password"
              autocomplete="current-password"
              required
            />
          </label>
          <p v-if="shareStore.unlockError && !linkUnlockFailed" class="m-0 rounded-[0.85rem] border border-[rgba(214,48,49,0.24)] bg-[rgba(214,48,49,0.08)] px-3 py-2 text-[0.84rem] text-[#c0392b]">
            {{ shareStore.unlockError }}
          </p>
          <button
            class="min-h-11 rounded-[0.8rem] border border-transparent bg-text px-4 font-semibold text-bg disabled:cursor-wait disabled:opacity-70"
            type="submit"
            :disabled="shareStore.unlocking"
          >
            {{ shareStore.unlocking ? t('share.unlocking') : t('share.unlock') }}
          </button>
        </form>
      </section>

      <ErrorState
        v-else
        class="mx-auto w-[min(100%,34rem)]"
        :title="shareStore.error ? t('share.errorTitle') : t('share.expiredTitle')"
        :message="shareStore.error ?? t('share.expiredDescription')"
      />
      <AlbumAttribution v-if="isCinema" />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRoute, useRouter } from 'vue-router';

import { provideCinemaAudio } from '../composables/useCinemaAudio';
import { useAppStore } from '../stores/app';
import AlbumAttribution from '../components/AlbumAttribution.vue';
import AlbumHeader from '../components/AlbumHeader.vue';
import Avatar from '../components/Avatar.vue';
import CinemaPost from '../components/CinemaPost.vue';
import CinemaGuestTeaser from '../components/CinemaGuestTeaser.vue';
import { sharedFeedItem } from '../utils/shared-media';
import EmptyState from '../components/EmptyState.vue';
import ErrorState from '../components/ErrorState.vue';
import FolderGrid from '../components/FolderGrid.vue';
import InfiniteLoader from '../components/InfiniteLoader.vue';
import { useShareStore } from '../stores/share';

const props = defineProps<{
  slug: string;
}>();

const { t } = useI18n();
const shareStore = useShareStore();
provideCinemaAudio();
const appStore = useAppStore();
const router = useRouter();
const route = useRoute();
const albumRoute = computed(() => {
  if (route.name === 'shared-post' && appStore.imageModalBackgroundPath) {
    const background = router.resolve(appStore.imageModalBackgroundPath);
    if (background.name === 'shared-folder' && background.params.slug === props.slug) return background;
  }
  return route;
});
const isCinema = computed(() => shareStore.folder?.displayTheme === 'cinema');
watch(isCinema, cinema => { if (cinema) window.dispatchEvent(new Event('foldergram:album-view-loading')); }, { flush: 'post' });
const isScroll = computed(() => albumRoute.value.query.view === 'scroll');
async function scrollToPhoto() {
  if (!isCinema.value || !isScroll.value) return;
  const id = Number(albumRoute.value.query.photo);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  while (isScroll.value && !shareStore.images.some(item => item.id === id) && shareStore.hasMore && !shareStore.loading) {
    const page = shareStore.page;
    await loadMore();
    if (shareStore.page === page || shareStore.error) break;
  }
  await nextTick();
  if (!isScroll.value || Number(albumRoute.value.query.photo) !== id) return;
  const target = document.getElementById(`shared-photo-${id}`);
  const previous = target?.previousElementSibling?.querySelector('.cinema-post__media');
  const header = document.querySelector('.cinema-header');
  if (previous && header) {
    const peek = window.matchMedia('(max-width: 767px)').matches ? 20 : 36;
    window.scrollTo({ top: Math.max(0, window.scrollY + previous.getBoundingClientRect().bottom - header.getBoundingClientRect().height - peek) });
  } else target?.scrollIntoView({ block: 'start' });
}
watch([() => albumRoute.value.query.view, () => albumRoute.value.query.photo], scrollToPhoto);
const password = ref('');
const linkUnlockFailed = ref(false);
const displayFolderTitle = computed(() => (shareStore.folder ? shareStore.folder.name : 'Shared folder'));
const isAccessPending = computed(() => !shareStore.error &&
  (shareStore.access === null || (shareStore.access.granted && !shareStore.folder)));


function extractFragmentToken(): string | null {
  if (typeof window === 'undefined' || !window.location.hash) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('token');
}

function clearFragmentToken() {
  if (typeof window === 'undefined' || !window.location.hash) {
    return;
  }

  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

async function initializeShare() {
  shareStore.reset();
  linkUnlockFailed.value = false;
  const token = extractFragmentToken();

  if (token) {
    try {
      await shareStore.unlockLink(props.slug, token);
    } catch {
      linkUnlockFailed.value = true;
    } finally {
      clearFragmentToken();
    }
  }

  try {
    if (!shareStore.access) await shareStore.loadAccess(props.slug);
  } catch (error) {
    shareStore.error = error instanceof Error ? error.message : t('share.errorDescription');
    return;
  }

  if (shareStore.access?.granted) {
    await shareStore.loadFolder(props.slug, true);
    await scrollToPhoto();
  }
}

async function loadMore() {
  if (shareStore.hasMore) {
    await shareStore.loadFolder(props.slug, false);
  }
}

async function unlockPassword() {
  linkUnlockFailed.value = false;

  try {
    await shareStore.unlockPassword(props.slug, password.value);
    password.value = '';

    if (shareStore.access?.granted) {
      await shareStore.loadFolder(props.slug, true);
      await scrollToPhoto();
    }
  } catch {
    // The store-owned error is rendered under the password field.
  }
}

onMounted(initializeShare);

watch(
  () => props.slug,
  async () => {
    password.value = '';
    await initializeShare();
  }
);
</script>

<style scoped>
.shared-album-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; min-height: 60vh; color: var(--muted); }
.shared-album-loading__logo { mix-blend-mode: var(--ur-logo-blend, multiply); filter: var(--ur-logo-filter, none); width: 144px; height: 144px; object-fit: contain; background: white; border-radius: 1rem; }
.shared-album-loading__indicator { width: 5rem; height: 3px; border-radius: 2px; background: var(--border); overflow: hidden; }
.shared-album-loading__indicator::after { content: ''; display: block; width: 40%; height: 100%; background: var(--muted); border-radius: inherit; animation: shared-album-loading 1.4s ease-in-out infinite alternate; }
@keyframes shared-album-loading { from { transform: translateX(0); } to { transform: translateX(150%); } }
@media (prefers-reduced-motion: reduce) { .shared-album-loading__indicator::after { animation: none; width: 100%; opacity: 0.5; } }
</style>

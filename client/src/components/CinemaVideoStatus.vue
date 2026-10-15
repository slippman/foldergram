<template>
  <img v-if="poster && !started" class="cinema-video-poster" :src="poster" alt="" aria-hidden="true" />
  <div v-if="showSpinner" class="cinema-video-status" role="status" :aria-label="t('common.loading')">
    <span class="cinema-video-status__spinner" aria-hidden="true" />
  </div>
  <div v-else-if="failed" class="cinema-video-status cinema-video-status--interactive" data-swipe-ignore="true">
    <button type="button" class="cinema-video-status__retry" @click.stop="retry" @keydown.stop>{{ t('common.retry') }}</button>
  </div>
  <div v-else-if="!started && !pending" class="cinema-video-status cinema-video-status--interactive" data-swipe-ignore="true">
    <button type="button" class="cinema-video-status__play" :aria-label="t('post.viewer.togglePlayback')" @click.stop="play" @keydown.stop>
      <span class="i-fluent-play-20-filled" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MediaPlayerElement } from 'vidstack/elements';

const props = defineProps<{ player: MediaPlayerElement | null; source: string; poster?: string; autoplay?: boolean }>();
const { t } = useI18n();
const started = ref(false);
const pending = ref(false);
const failed = ref(false);
const showSpinner = ref(false);
let requested = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function stopWaiting() {
  clearTimeout(timer);
  timer = undefined;
  pending.value = false;
  showSpinner.value = false;
}
function waitForPlayback() {
  if (failed.value || pending.value) return;
  pending.value = true;
  timer = setTimeout(() => { showSpinner.value = true; }, 300);
}
function requestPlayback() {
  requested = true;
  waitForPlayback();
}
function pause() {
  requested = false;
  stopWaiting();
}
function reset() {
  pause();
  started.value = false;
  failed.value = false;
}
function load() {
  reset();
  if (props.autoplay) requestPlayback();
}
function playing() {
  started.value = true;
  failed.value = false;
  stopWaiting();
}
function waiting() {
  if (requested || props.player?.paused === false) waitForPlayback();
}
function fail() {
  pause();
  failed.value = true;
}
async function play() {
  const player = props.player;
  if (!player) return;
  const source = props.source;
  requestPlayback();
  try { await player.play(); }
  catch (error) {
    if (props.player !== player || props.source !== source) return;
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NotAllowedError') pause();
    else fail();
  }
}
function retry() {
  failed.value = false;
  props.player?.querySelector('video')?.load();
  props.player?.startLoading?.();
  void play();
}

watch(() => props.source, reset, { flush: 'sync' });
watch(() => props.autoplay, (autoplay) => {
  if (!autoplay) pause();
  else if (props.player && !props.player.state?.playing) requestPlayback();
});
watch(() => props.player, (player, _previous, onCleanup) => {
  reset();
  if (!player) return;
  const events = { 'load-start': load, play: requestPlayback, playing, waiting, pause, ended: pause, error: fail, 'auto-play-fail': pause };
  for (const [name, handler] of Object.entries(events)) player.addEventListener(name, handler);
  if (player.state?.playing) playing();
  else if (player.state?.error) fail();
  else if (props.autoplay) requestPlayback();
  onCleanup(() => {
    for (const [name, handler] of Object.entries(events)) player.removeEventListener(name, handler);
    reset();
  });
}, { immediate: true, flush: 'post' });
onBeforeUnmount(stopWaiting);
</script>

<style scoped>
.cinema-video-poster { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: contain; background: black; pointer-events: none; }
.cinema-video-status { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; pointer-events: none; color: white; }
.cinema-video-status--interactive button { pointer-events: auto; cursor: pointer; color: white; background: rgb(0 0 0 / 65%); border: 0; }
.cinema-video-status__play { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; }
.cinema-video-status__play span { width: 28px; height: 28px; }
.cinema-video-status__retry { padding: 12px 20px; border-radius: 24px; font: inherit; }
.cinema-video-status__spinner { width: 36px; height: 36px; box-sizing: border-box; border: 3px solid rgb(255 255 255 / 35%); border-top-color: white; border-radius: 50%; background: rgb(0 0 0 / 20%); animation: cinema-video-spin .8s linear infinite; }
@keyframes cinema-video-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cinema-video-status__spinner { animation: none; } }
</style>

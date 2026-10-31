<template>
  <section id="activity" class="card account-activity">
    <header class="account-activity__heading">
      <div><h2><RouterLink class="account-activity__permalink" :to="{ path: '/settings', query: { section: 'access' }, hash: '#activity' }">{{ t('activity.title') }}</RouterLink></h2><p>{{ t('activity.description') }}</p></div>
      <div class="account-activity__controls">
        <span class="account-activity__period">
          <select v-model="period" :aria-label="t('activity.period')" @change="page = 1; load()">
            <option value="all">{{ t('activity.all') }}</option><option value="today">{{ t('activity.today') }}</option><option value="week">{{ t('activity.week') }}</option>
          </select>
          <span class="account-activity__period-arrow i-fluent-chevron-down-16-regular" aria-hidden="true" />
        </span>
        <button type="button" :disabled="busy || signedInBusy" @click="refresh()">{{ t('activity.refresh') }}</button>
      </div>
    </header>
    <section class="account-activity__signed-in" :aria-label="t('activity.signedInTitle')">
      <h3>{{ t('activity.signedInTitle') }} <span v-if="signedIn" class="account-activity__signed-in-count">{{ signedIn.total }}</span></h3>
      <p class="account-activity__note">{{ t('activity.signedInDescription') }}</p>
      <p v-if="signedInError" role="alert">{{ t('activity.signedInFailed') }}</p>
      <p v-else-if="!signedIn && signedInBusy" role="status">{{ t('activity.loading') }}</p>
      <div v-if="signedIn?.items.length" class="account-activity__table account-activity__signed-in-table">
        <table>
          <thead><tr><th scope="col">{{ t('activity.email') }}</th><th scope="col">{{ t('activity.lastActive') }}</th><th scope="col">{{ t('activity.sessions') }}</th></tr></thead>
          <tbody><tr v-for="user in signedIn.items" :key="user.id"><td>{{ user.email }}</td><td>{{ date(user.lastActiveAt) }}</td><td>{{ user.sessionCount }}</td></tr></tbody>
        </table>
      </div>
      <p v-else-if="signedIn">{{ t('activity.signedInEmpty') }}</p>
      <p v-if="signedIn && signedIn.total > signedIn.items.length" class="account-activity__note">{{ t('activity.signedInLimit', { count: signedIn.limit, total: signedIn.total }) }}</p>
    </section>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">{{ t('activity.loading') }}</p>
    <p v-if="state" class="account-activity__note">{{ t('activity.started', { date: date(state.captureStartedAt), timezone: state.timezone }) }}</p>
    <div v-if="state?.items.length" class="account-activity__table account-activity__history-table">
      <table>
        <caption class="sr-only">{{ t('activity.title') }}</caption>
        <thead><tr><th>{{ t('activity.email') }}</th><th>{{ t('activity.lastActive') }}</th><th>{{ t('activity.firstJoined') }}</th><th>{{ t('activity.logins') }}</th><th>{{ t('activity.views') }}</th><th>{{ t('activity.albums') }}</th><th>{{ t('activity.likes') }}</th></tr></thead>
        <tbody><template v-for="user in state.items" :key="user.id">
          <tr><td><button type="button" class="account-activity__identity" :aria-expanded="expanded === user.id" @click="expand(user.id)"><span class="account-activity__chevron i-fluent-chevron-right-16-regular" aria-hidden="true" /><span>{{ user.email }}</span></button></td><td>{{ date(user.lastActiveAt) }}</td><td>{{ user.joinedAt === null ? '' : date(user.joinedAt, true) }}</td><td>{{ user.loginCount }}</td><td>{{ user.albumViews }}</td><td>{{ user.uniqueAlbums }}</td><td>{{ user.likes }}</td></tr>
          <tr v-if="expanded === user.id"><td colspan="7">
            <p v-if="detailBusy" role="status">{{ t('activity.loading') }}</p>
            <div v-if="detail" class="account-activity__detail">
              <section>
                <h3>{{ t('activity.albumViews') }}</h3>
                <table v-if="detail.albums.length" class="account-activity__detail-table">
                  <thead><tr><th scope="col">{{ t('activity.album') }}</th><th scope="col" class="account-activity__count">{{ t('activity.viewCount') }}</th><th scope="col" class="account-activity__date">{{ t('activity.lastViewed') }}</th></tr></thead>
                  <tbody><tr v-for="album in detail.albums" :key="album.albumKey"><td>{{ album.name }}</td><td class="account-activity__count">{{ album.views }}</td><td class="account-activity__date">{{ date(album.lastViewedAt) }}</td></tr></tbody>
                </table>
                <p v-else>{{ t('activity.none') }}</p>
              </section>
              <section>
                <h3>{{ t('activity.likedPhotos') }}</h3>
                <table v-if="detail.likes.length" class="account-activity__detail-table">
                  <thead><tr><th scope="col">{{ t('activity.album') }}</th><th scope="col">{{ t('activity.photo') }}</th><th scope="col" class="account-activity__date">{{ t('activity.likedOn') }}</th></tr></thead>
                  <tbody><tr v-for="like in detail.likes" :key="like.id"><td>{{ like.folderName }}</td><td><RouterLink :to="{ name: 'image', params: { id: like.id } }">{{ like.filename }}</RouterLink></td><td class="account-activity__date">{{ date(like.likedAt) }}</td></tr></tbody>
                </table>
                <p v-else>{{ t('activity.none') }}</p>
              </section>
              <p v-if="detail.albums.length >= detail.detailLimit || detail.likes.length >= detail.detailLimit" class="account-activity__note">{{ t('activity.detailLimit', { count: detail.detailLimit }) }}</p>
            </div>
          </td></tr>
        </template></tbody>
      </table>
    </div>
    <p v-else-if="state && !busy">{{ t('activity.empty') }}</p>
    <footer v-if="state && (page > 1 || state.hasMore)" class="account-activity__controls">
      <button :disabled="busy || page <= 1" @click="page--; load()">{{ t('activity.previous') }}</button><span>{{ page }}</span><button :disabled="busy || !state.hasMore" @click="page++; load()">{{ t('activity.next') }}</button>
    </footer>
  </section>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { fetchActivity, fetchAccountActivity, fetchSignedInActivity, type SignedInActivity, type ActivityPeriod, type ActivitySummary, type ActivityDetail } from '../api/activity';
const { t, locale } = useI18n();
const period = ref<ActivityPeriod>('all');
const page = ref(1);
const state = ref<ActivitySummary | null>(null);
const busy = ref(false);
const error = ref('');
const expanded = ref<number | null>(null);
const detail = ref<ActivityDetail | null>(null);
const detailBusy = ref(false);
const signedIn = ref<SignedInActivity | null>(null);
const signedInBusy = ref(false);
const signedInError = ref(false);
let signedInGeneration = 0;
let signedInTimer = 0;
async function loadSignedIn() {
  if (signedInBusy.value || document.visibilityState === 'hidden') return;
  const run = ++signedInGeneration;
  signedInBusy.value = true;
  signedInError.value = false;
  try { const result = await fetchSignedInActivity(); if (run === signedInGeneration) signedIn.value = result; }
  catch { if (run === signedInGeneration) { signedIn.value = null; signedInError.value = true; } }
  finally { if (run === signedInGeneration) signedInBusy.value = false; }
}
function refresh() { void load(); void loadSignedIn(); }
function handleVisibility() { if (document.visibilityState === 'visible') void loadSignedIn(); }
let generation = 0;
let detailGeneration = 0;
function date(value: number | string | null, dateOnly = false) {
  return value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: dateOnly ? undefined : 'short', timeZone: state.value?.timezone ?? signedIn.value?.timezone }).format(new Date(value)) : '—';
}
async function load() {
  const run = ++generation;
  detailGeneration++; expanded.value = null; detail.value = null; detailBusy.value = false;
  busy.value = true; error.value = '';
  try { const result = await fetchActivity(period.value, page.value); if (run === generation) state.value = result; }
  catch { if (run === generation) error.value = t('activity.failed'); }
  finally { if (run === generation) busy.value = false; }
}
async function expand(id: number) {
  const run = ++detailGeneration;
  expanded.value = expanded.value === id ? null : id; detail.value = null;
  if (expanded.value === null) { detailBusy.value = false; return; }
  detailBusy.value = true; error.value = '';
  try { const result = await fetchAccountActivity(id, period.value); if (run === detailGeneration) detail.value = result; }
  catch { if (run === detailGeneration) error.value = t('activity.failed'); }
  finally { if (run === detailGeneration) detailBusy.value = false; }
}
onMounted(() => {
  refresh();
  signedInTimer = window.setInterval(() => { void loadSignedIn(); }, 30_000);
  document.addEventListener('visibilitychange', handleVisibility);
});
onBeforeUnmount(() => {
  generation++; detailGeneration++; signedInGeneration++;
  window.clearInterval(signedInTimer);
  document.removeEventListener('visibilitychange', handleVisibility);
});
</script>
<style scoped>
.account-activity { padding: 1.5rem; min-width: 0; }
.account-activity { scroll-margin-top: 5rem; }
.account-activity__permalink { color: inherit; text-decoration: none; }
.account-activity__permalink:hover { text-decoration: underline; text-underline-offset: .2em; }
.account-activity__heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
h2 { margin: 0; font-size: 1.05rem; } h3 { margin: 0 0 .75rem; font-size: .875rem; }
p { color: var(--muted); font-size: .8125rem; line-height: 1.5; }
.account-activity__controls { display: flex; align-items: center; gap: .5rem; }
button, select { border: 1px solid var(--border); border-radius: .65rem; background: var(--surface-alt); color: var(--text); padding: .5rem .75rem; font: inherit; font-size: .8125rem; min-height: 2.75rem; cursor: pointer; }
.account-activity__controls > button, .account-activity__period select { box-sizing: border-box; height: 2.25rem; min-height: 2.25rem; line-height: 1.25; margin: 0; }
.account-activity__period { position: relative; display: inline-flex; flex: none; }
.account-activity__period select { appearance: none; -webkit-appearance: none; width: auto; min-width: 0; padding: .375rem 2rem .375rem .75rem; }
.account-activity__period-arrow { position: absolute; right: .625rem; top: 50%; transform: translateY(-50%); width: 1rem; height: 1rem; color: var(--muted); pointer-events: none; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
.account-activity__table { overflow-x: auto; margin: 1rem 0; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: .8125rem; font-variant-numeric: tabular-nums; }
th { color: var(--muted); font-size: .75rem; font-weight: 600; } th, td { padding: .75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
.account-activity__identity { display: inline-flex; align-items: center; gap: .375rem; padding: .25rem 0; border: 0; border-radius: .25rem; background: transparent; font-weight: 500; text-align: left; }
.account-activity__identity:hover { color: var(--accent-strong, var(--text)); }
.account-activity__chevron { flex: none; width: 1rem; height: 1rem; color: var(--muted); transition: transform .15s ease; }
.account-activity__identity[aria-expanded="true"] .account-activity__chevron { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .account-activity__chevron { transition: none; } }
.account-activity__detail { display: grid; gap: 1.5rem; padding: .75rem 0; white-space: normal; }
.account-activity__detail-table { table-layout: fixed; }
.account-activity__detail-table th { background: var(--surface-alt); }
.account-activity__detail-table th, .account-activity__detail-table td { padding: .625rem .875rem; white-space: normal; overflow-wrap: anywhere; vertical-align: top; }
.account-activity__detail-table tbody tr:last-child td { border-bottom: 0; }
.account-activity__detail-table .account-activity__count { width: 5rem; text-align: right; font-weight: 600; }
.account-activity__detail-table .account-activity__date { width: 14rem; white-space: nowrap; color: var(--muted); }
.account-activity__detail-table a { text-decoration: underline; text-underline-offset: .15em; }
.account-activity__signed-in { margin: 1.25rem 0; padding: 1rem; border: 1px solid var(--border); border-radius: .75rem; }
.account-activity__signed-in h3 { display: flex; align-items: center; gap: .5rem; margin-bottom: .375rem; }
.account-activity__signed-in-count { display: inline-grid; place-items: center; min-width: 1.5rem; height: 1.5rem; padding: 0 .375rem; border-radius: 999px; background: var(--surface-alt); color: var(--muted); font-size: .75rem; }
.account-activity__signed-in-table { max-height: 15rem; margin-bottom: 0; }
.account-activity__signed-in-table th { position: sticky; top: 0; background: var(--surface); }
.account-activity__note { font-size: .75rem; }
@media(max-width: 640px) { .account-activity { padding: 1rem; } }
</style>

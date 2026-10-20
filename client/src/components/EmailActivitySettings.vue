<template>
  <section class="card account-activity">
    <header class="account-activity__heading">
      <div><h2>{{ t('activity.title') }}</h2><p>{{ t('activity.description') }}</p></div>
      <div class="account-activity__controls">
        <select v-model="period" :aria-label="t('activity.period')" @change="page = 1; load()">
          <option value="all">{{ t('activity.all') }}</option><option value="today">{{ t('activity.today') }}</option><option value="week">{{ t('activity.week') }}</option>
        </select>
        <button type="button" :disabled="busy" @click="load()">{{ t('activity.refresh') }}</button>
      </div>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">{{ t('activity.loading') }}</p>
    <p v-if="state" class="account-activity__note">{{ t('activity.started', { date: date(state.captureStartedAt), timezone: state.timezone }) }}</p>
    <div v-if="state?.items.length" class="account-activity__table">
      <table>
        <caption class="sr-only">{{ t('activity.title') }}</caption>
        <thead><tr><th>{{ t('activity.email') }}</th><th>{{ t('activity.lastActive') }}</th><th>{{ t('activity.lastLogin') }}</th><th>{{ t('activity.logins') }}</th><th>{{ t('activity.views') }}</th><th>{{ t('activity.albums') }}</th><th>{{ t('activity.likes') }}</th></tr></thead>
        <tbody><template v-for="user in state.items" :key="user.id">
          <tr><td><button class="account-activity__identity" :aria-expanded="expanded === user.id" @click="expand(user.id)">{{ user.email }}</button></td><td>{{ date(user.lastActiveAt) }}</td><td>{{ date(user.lastLoginAt) }}</td><td>{{ user.loginCount }}</td><td>{{ user.albumViews }}</td><td>{{ user.uniqueAlbums }}</td><td>{{ user.likes }}</td></tr>
          <tr v-if="expanded === user.id"><td colspan="7">
            <p v-if="detailBusy" role="status">{{ t('activity.loading') }}</p>
            <div v-if="detail" class="account-activity__detail">
              <section><h3>{{ t('activity.albumViews') }}</h3><ul v-if="detail.albums.length"><li v-for="album in detail.albums" :key="album.albumKey"><span>{{ album.name }}</span><strong>{{ album.views }}</strong><small>{{ date(album.lastViewedAt) }}</small></li></ul><p v-else>{{ t('activity.none') }}</p></section>
              <section><h3>{{ t('activity.likedPhotos') }}</h3><ul v-if="detail.likes.length"><li v-for="like in detail.likes" :key="like.id"><RouterLink :to="{ name: 'image', params: { id: like.id } }">{{ like.folderName }} · {{ like.filename }}</RouterLink><small>{{ date(like.likedAt) }}</small></li></ul><p v-else>{{ t('activity.none') }}</p></section>
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
import { fetchActivity, fetchAccountActivity, type ActivityPeriod, type ActivitySummary, type ActivityDetail } from '../api/activity';
const { t, locale } = useI18n();
const period = ref<ActivityPeriod>('all');
const page = ref(1);
const state = ref<ActivitySummary | null>(null);
const busy = ref(false);
const error = ref('');
const expanded = ref<number | null>(null);
const detail = ref<ActivityDetail | null>(null);
const detailBusy = ref(false);
let generation = 0;
let detailGeneration = 0;
function date(value: number | string | null) {
  return value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short', timeZone: state.value?.timezone }).format(new Date(value)) : '—';
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
onMounted(load);
onBeforeUnmount(() => { generation++; detailGeneration++; });
</script>
<style scoped>
.account-activity { padding: 1.5rem; min-width: 0; }
.account-activity__heading { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: 1rem; }
h2 { margin: 0; font-size: 1.05rem; } h3 { margin: 0 0 .75rem; font-size: .875rem; }
p { color: var(--muted); font-size: .8125rem; line-height: 1.5; }
.account-activity__controls { display: flex; align-items: center; gap: .5rem; }
button, select { border: 1px solid var(--border); border-radius: .65rem; background: var(--surface-alt); color: var(--text); padding: .5rem .75rem; font: inherit; font-size: .8125rem; min-height: 2.75rem; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
.account-activity__table { overflow-x: auto; margin: 1rem 0; }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: .8125rem; font-variant-numeric: tabular-nums; }
th { color: var(--muted); font-size: .75rem; font-weight: 600; } th, td { padding: .75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
.account-activity__identity { font-weight: 600; background: var(--surface-alt); }
.account-activity__detail { display: grid; grid-template-columns: repeat(auto-fit,minmax(14rem,1fr)); gap: 1.5rem; padding: .5rem; white-space: normal; }
ul { list-style: none; margin: 0; padding: 0; } li { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; padding: .5rem 0; border-bottom: 1px solid var(--border); } small { color: var(--muted); font-size: .75rem; } li small { margin-left: auto; }
.account-activity__note { font-size: .75rem; }
@media(max-width: 640px) { .account-activity { padding: 1rem; } }
</style>

<template>
  <section class="card email-access" :inert="!!deletingUser">
    <header class="email-access__heading">
      <h2>{{ t('emailAuth.requestsTitle') }} <span v-if="pending.length" class="email-access__count">{{ pending.length }}</span></h2>
      <button class="email-access__refresh" type="button" :aria-label="t('emailAuth.refreshRequests')" :title="t('emailAuth.refreshRequests')" :disabled="busy" @click="refresh">
        <svg :class="{ 'email-access__refreshing': busy }" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M19.2 12a7.5 7.5 0 1 0-1.6 4.6M20 12l-3-4" /></svg>
      </button>
    </header>
    <p class="email-access__description">{{ t('emailAuth.requestsDescription') }}</p>
    <p v-if="state && !state.deliveryConfigured" class="email-access__feedback">{{ t('emailAuth.notConfigured') }}</p>
    <p v-if="error" role="alert" class="email-access__feedback email-access__feedback--error">{{ error }}</p>
    <p v-if="notice && noticeArea === 'requests'" role="status" class="email-access__feedback">{{ notice }}</p>
    <ul v-if="pending.length" class="email-access__list">
      <li v-for="user in pending" :key="user.id" class="email-access__row" :data-request-id="user.id">
        <div class="email-access__identity"><strong>{{ user.email }}</strong><p>{{ t('emailAuth.notVerified') }}</p></div>
        <div class="email-access__actions">
          <button class="email-access__button email-access__button--primary" type="button" :disabled="busy || !state?.deliveryConfigured" @click="approveRequest(user.id)">{{ t('emailAuth.approveAndSend') }}</button>
          <button class="email-access__button" type="button" :disabled="busy" @click="deletingUser = user">{{ t('emailAuth.rejectRequest') }}</button>
        </div>
      </li>
    </ul>
    <p v-else-if="state" class="email-access__empty">{{ t('emailAuth.noRequests') }}</p>

    <section class="email-access__section">
      <h3>{{ t('emailAuth.invitationTitle') }}</h3>
      <p class="email-access__description">{{ t('emailAuth.invitationDescription') }}</p>
      <form class="email-access__invite" @submit.prevent="sendInvitation">
        <label class="email-access__field" for="access-invite-email">{{ t('emailAuth.email') }}<input id="access-invite-email" v-model="inviteEmail" type="email" autocomplete="email" placeholder="someone@example.com" required maxlength="254" :disabled="busy" /></label>
        <button class="email-access__button email-access__button--primary" type="submit" :disabled="busy || !state?.deliveryConfigured">{{ t(sendingInvitation ? 'emailAuth.sendingInvitation' : 'emailAuth.sendInvitation') }}</button>
      </form>
      <p v-if="notice && noticeArea === 'invite'" role="status" class="email-access__feedback">{{ notice }}</p>
    </section>

    <section class="email-access__section">
      <h3>{{ t('emailAuth.accountsTitle') }} <span v-if="state" class="email-access__count">{{ people.length }}</span></h3>
      <p v-if="notice && noticeArea === 'people'" role="status" class="email-access__feedback">{{ notice }}</p>
      <ul class="email-access__list">
        <li v-for="user in people" :key="user.id" class="email-access__row">
          <div class="email-access__identity"><strong>{{ user.display_name }}</strong><p v-if="user.display_name !== user.email">{{ user.email }}</p><span v-if="user.last_signed_in_at === null" class="email-access__badge">{{ t('emailAuth.invited') }}</span></div>
          <button class="email-access__button email-access__button--delete" type="button" :disabled="busy" @click="deletingUser = user">{{ t('emailAuth.deleteLabel') }}</button>
        </li>
      </ul>
      <p v-if="state && people.length === 0" class="email-access__empty">{{ t('emailAuth.noAccounts') }}</p>
    </section>
  </section>
  <ConfirmDialog v-if="deletingUser"
    :title="t(isPendingRequest(deletingUser) ? 'emailAuth.rejectRequest' : 'emailAuth.deleteUser')"
    :message="t(isPendingRequest(deletingUser) ? 'emailAuth.rejectConfirmation' : 'emailAuth.deleteConfirmation', { email: deletingUser.email })"
    :confirm-label="t(isPendingRequest(deletingUser) ? 'emailAuth.rejectRequest' : 'emailAuth.deleteUser')"
    :cancel-label="t('emailAuth.cancelDelete')" :loading-label="t('emailAuth.deleting')" :loading="busy"
    @cancel="!busy && (deletingUser = null)" @confirm="removeUser" />
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { sendEmailInvitation, approveAccessRequest, fetchLibraryUsers, rejectAccessRequest, deleteLibraryUser, type LibraryUser, type LibraryUsersPayload } from '../api/email-auth';
import ConfirmDialog from './ConfirmDialog.vue';
const { t } = useI18n();
const emit = defineEmits<{ ready: [] }>();
const state = ref<LibraryUsersPayload | null>(null);
const isPendingRequest = (user: LibraryUser) => user.access_status === 'pending' && user.requested_at != null;
const pending = computed(() => state.value?.items.filter(user => isPendingRequest(user)) ?? []);
const people = computed(() => state.value?.items.filter(user => !isPendingRequest(user)) ?? []);
const deletingUser = ref<LibraryUser | null>(null);
const inviteEmail = ref(''); const sendingInvitation = ref(false);
const busy = ref(false); const error = ref(''); const notice = ref('');
const noticeArea = ref<'requests' | 'invite' | 'people'>('requests');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function showNotice(message: string, area: 'requests' | 'invite' | 'people', transient = true) {
  clearTimeout(noticeTimer);
  noticeArea.value = area; notice.value = message;
  if (transient) noticeTimer = setTimeout(() => { notice.value = ''; }, 5000);
}
let mounted = true;
let revision = 0;
let poll: ReturnType<typeof setInterval> | undefined;
async function load() {
  const current = ++revision;
  const payload = await fetchLibraryUsers();
  if (mounted && current === revision) state.value = payload;
}
onMounted(() => {
  void refresh().finally(() => { if (mounted) emit('ready'); });
  poll = setInterval(() => { if (!busy.value && !document.hidden) void load().catch(() => {}); }, 15_000);
});
onBeforeUnmount(() => { mounted = false; revision++; clearInterval(poll); clearTimeout(noticeTimer); });
async function refresh() {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = ''; clearTimeout(noticeTimer);
  try { await load(); } catch { error.value = t('emailAuth.accountsFailed'); }
  finally { busy.value = false; }
}
async function sendInvitation() {
  if (busy.value) return;
  const email = inviteEmail.value.trim();
  busy.value = true; sendingInvitation.value = true; error.value = ''; notice.value = '';
  try {
    await sendEmailInvitation(email);
    showNotice(t('emailAuth.invitationSent', { email }), 'invite');
    inviteEmail.value = '';
    await load();
  } catch (reason) { error.value = reason instanceof Error ? reason.message : t('emailAuth.accountsFailed'); }
  finally { busy.value = false; sendingInvitation.value = false; }
}
async function approveRequest(id: number) {
  if (busy.value) return;
  busy.value = true; error.value = ''; notice.value = ''; revision++;
  try {
    const result = await approveAccessRequest(id);
    await load();
    showNotice(t(result.emailSent ? 'emailAuth.approvedAndSent' : 'emailAuth.approvedEmailFailed'), 'requests', result.emailSent);
  } catch (reason) { error.value = reason instanceof Error ? reason.message : t('emailAuth.accountsFailed'); }
  finally { busy.value = false; }
}
async function removeUser() {
  if (busy.value || !deletingUser.value) return;
  const user = deletingUser.value;
  busy.value = true; error.value = ''; notice.value = ''; revision++;
  try {
    if (isPendingRequest(user)) await rejectAccessRequest(user.id);
    else await deleteLibraryUser(user.id);
    deletingUser.value = null;
    // Remove stale identity immediately, even if refreshing the list later fails.
    if (state.value) state.value.items = state.value.items.filter(item => item.id !== user.id);
    showNotice(t(isPendingRequest(user) ? 'emailAuth.requestRejected' : 'emailAuth.userDeleted'), isPendingRequest(user) ? 'requests' : 'people');
    await load();
  } catch { deletingUser.value = null; error.value = t('emailAuth.accountsFailed'); }
  finally { busy.value = false; }
}
</script>

<style scoped>
.email-access { min-width: 0; padding: 1.5rem; font-size: .875rem; line-height: 1.5; }
.email-access__heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .375rem; }
.email-access h2, .email-access h3 { display: flex; align-items: center; gap: .5rem; margin: 0; color: var(--text); font-size: 1rem; font-weight: 650; letter-spacing: -.02em; }
.email-access__count { display: inline-grid; place-items: center; min-width: 1.375rem; height: 1.375rem; padding: 0 .375rem; border-radius: 999px; background: var(--surface-alt); color: var(--muted); font-size: .6875rem; font-weight: 600; letter-spacing: 0; }
.email-access__description { max-width: 40rem; margin: 0; color: var(--muted); font-size: .8125rem; line-height: 1.6; }
.email-access__refresh { flex: none; display: grid; place-items: center; width: 2.125rem; height: 2.125rem; padding: 0; border: 1px solid var(--border); border-radius: .5rem; background: transparent; color: var(--muted); cursor: pointer; }
.email-access__refresh:hover { background: var(--surface-alt); color: var(--text); }
.email-access__section { display: grid; gap: .75rem; margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
.email-access__empty { margin: .875rem 0 0; padding: .75rem 1rem; border: 1px dashed var(--border); border-radius: .5rem; color: var(--muted); font-size: .8125rem; }
.email-access__section > .email-access__empty { margin: 0; }
.email-access__invite { display: grid; grid-template-columns: minmax(0, 22rem) auto; align-items: end; justify-content: start; gap: .625rem; }
.email-access__field { display: grid; gap: .375rem; min-width: 0; color: var(--muted); font-size: .75rem; font-weight: 500; }
.email-access__field input { box-sizing: border-box; width: 100%; min-width: 0; height: 2.375rem; padding: .5rem .75rem; border: 1px solid var(--border); border-radius: .5rem; background: var(--surface); color: var(--text); font: inherit; font-size: .875rem; font-weight: 400; }
.email-access__field input::placeholder { color: var(--muted); opacity: .75; }
.email-access__field input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.email-access__list { display: grid; margin: .5rem 0 0; padding: 0; list-style: none; }
.email-access__section > .email-access__list { margin: 0; }
.email-access__row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .875rem 0; border-bottom: 1px solid var(--border); }
.email-access__row:last-child { border-bottom: 0; padding-bottom: 0; }
.email-access__row:first-child { padding-top: .25rem; }
.email-access__identity { min-width: 0; overflow-wrap: anywhere; }
.email-access__identity strong { color: var(--text); font-size: .875rem; font-weight: 600; }
.email-access__identity p { margin: .125rem 0 0; color: var(--muted); font-size: .8125rem; }
.email-access__badge { display: inline-block; margin-top: .25rem; padding: .0625rem .375rem; border: 1px solid var(--border); border-radius: .25rem; color: var(--muted); font-size: .6875rem; }
.email-access__actions { display: flex; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: .5rem; }
.email-access__button { display: inline-flex; flex: none; align-items: center; justify-content: center; min-height: 2.125rem; padding: .375rem .75rem; border: 1px solid var(--border); border-radius: .375rem; background: var(--surface); color: var(--text); font: inherit; font-size: .75rem; line-height: 1.4; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s, opacity .15s; }
.email-access__button:hover { background: var(--surface-alt); }
.email-access__button--primary { min-height: 2.375rem; border-color: var(--text); background: var(--text); color: var(--bg); }
.email-access__button--primary:hover { background: var(--text); opacity: .85; }
.email-access__button--delete { border-color: #d93025; background: #d93025; color: #fff; }
.email-access__button--delete:hover { border-color: #b3261e; background: #b3261e; }
.email-access__button:focus-visible, .email-access__refresh:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
.email-access button:disabled { opacity: .5; cursor: wait; }
.email-access__feedback { margin: .75rem 0; padding: .625rem .875rem; border: 1px solid var(--border); border-left: 3px solid #239a70; border-radius: .375rem; background: var(--surface-alt); font-size: .8125rem; overflow-wrap: anywhere; }
.email-access__section > .email-access__feedback { margin: 0; }
.email-access__feedback--error { border-left-color: #d93025; }
.email-access__refreshing { animation: access-refresh-spin 1s linear infinite; }
@keyframes access-refresh-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .email-access__refreshing { animation: none; } }
@media (max-width: 600px) {
  .email-access { padding: 1.125rem; }
  .email-access__invite { grid-template-columns: minmax(0, 1fr); justify-content: stretch; }
  .email-access__invite > button { justify-self: start; }
  .email-access__row { gap: .75rem; }
  .email-access__actions { flex-direction: column; }
  .email-access__button, .email-access__refresh { min-height: 2.75rem; }
  .email-access__refresh { width: 2.75rem; }
  .email-access__field input { height: 2.75rem; font-size: 1rem; }
}
</style>

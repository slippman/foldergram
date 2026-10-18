<template>
  <section class="email-sign-in min-h-screen px-6 py-10 flex items-center justify-center">
    <div class="card w-full max-w-[27rem] p-8 grid gap-5" :inert="!!notice" :class="{ 'text-center': !!identity || awaitingEmail }">
      <header class="grid justify-items-center gap-3 text-center">
        <img class="email-sign-in__logo" src="/branding/ur-logo-4e4dc1180945.png" alt="UnReeled" width="112" height="112" />
        <h1 class="m-0 text-2xl font-semibold">{{ t('emailAuth.title') }}</h1>
      </header>
      <p v-if="!identity && !awaitingEmail && !inspecting" id="email-auth-description" class="m-0 text-muted">{{ t('emailAuth.description') }}</p>
      <p v-if="error" class="m-0 text-rose-600" role="alert">{{ error }}</p>
      <form v-if="identity" class="grid gap-4" @submit.prevent="confirm">
        <p class="m-0 break-words">{{ t(invitation ? 'emailAuth.invitationFor' : 'emailAuth.confirmAccount', { email: identity.email }) }}</p>
        <label v-if="identity.firstSignIn && !invitation" class="grid gap-2 text-left" for="screen-name">
          <span class="font-semibold">{{ t('emailAuth.screenName') }}</span>
          <input id="screen-name" v-model="screenName" name="nickname" autocomplete="nickname" maxlength="100" :placeholder="t('emailAuth.screenNamePlaceholder')" aria-describedby="screen-name-hint" class="rounded-lg border border-border bg-surface-alt px-4 py-3 text-text" :disabled="busy" />
          <span id="screen-name-hint" class="text-sm text-muted leading-relaxed">{{ t('emailAuth.screenNameHint') }}</span>
        </label>
        <button class="btn-primary email-sign-in__submit justify-center" :disabled="busy" type="submit">{{ t(invitation ? 'emailAuth.acceptInvitation' : 'emailAuth.continue') }}</button>
        <button class="btn-primary email-sign-in__submit justify-center" :disabled="busy" type="button" @click="useAnotherAddress">{{ t('emailAuth.another') }}</button>
      </form>
      <section v-else-if="awaitingEmail && !inspecting" class="grid gap-4 text-center" role="status" aria-labelledby="email-waiting-heading">
        <h2 id="email-waiting-heading" ref="waitingHeading" tabindex="-1" class="m-0 text-xl font-bold">{{ t('emailAuth.noticeTitle') }}</h2>
        <p class="m-0 leading-relaxed text-muted">{{ t('emailAuth.sent') }}</p>
        <p class="m-0 leading-relaxed">{{ t('emailAuth.waitingInstructions') }}</p>
        <p class="email-sign-in__notice-hint">{{ t('emailAuth.approvalHint') }}</p>
        <button class="btn-primary email-sign-in__submit justify-center" type="button" @click="useAnotherAddress">{{ t('emailAuth.another') }}</button>
      </section>
      <form v-else-if="!inspecting" name="unreeled-sign-in" method="post" autocomplete="on" class="grid gap-4" @submit.prevent="requestLink">
        <label for="unreeled-sign-in-email" class="grid gap-2">
          <span class="sr-only">{{ t('emailAuth.email') }}</span>
          <input id="unreeled-sign-in-email" v-model="email" name="email" type="email" :placeholder="t('emailAuth.emailPlaceholder')" autocomplete="email" inputmode="email" autocapitalize="none" autocorrect="off" :spellcheck="false" enterkeyhint="send" aria-describedby="email-auth-description email-auth-privacy email-auth-promise" required maxlength="254" class="rounded-lg border border-border bg-surface-alt px-4 py-3 text-text" :disabled="busy" />
        </label>
        <button ref="requestButton" class="btn-primary email-sign-in__submit justify-center" type="submit" :disabled="busy">{{ t('emailAuth.sendLink') }}</button>
        <p id="email-auth-promise" class="email-sign-in__promise m-0 text-sm text-center"><strong>{{ t('emailAuth.promise') }}</strong></p>
      </form>
      <p v-else class="m-0 text-muted" role="status">{{ t('emailAuth.checking') }}</p>
      <p id="email-auth-privacy" class="m-0 text-sm leading-relaxed text-muted">{{ t('emailAuth.privacy') }}</p>
    </div>
    <div v-if="notice" class="email-sign-in__notice" @click.self="dismissNotice" @keydown.esc.stop.prevent="dismissNotice" @keydown.tab.prevent="noticeButton?.focus()">
      <section class="email-sign-in__notice-card" role="dialog" aria-modal="true" aria-labelledby="email-auth-notice" aria-describedby="email-auth-notice-body email-auth-notice-hint">
        <span class="email-sign-in__notice-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg></span>
        <h2 id="email-auth-notice" class="email-sign-in__notice-title">{{ t('emailAuth.noticeTitle') }}</h2>
        <p id="email-auth-notice-body" class="email-sign-in__notice-body">{{ notice }}</p>
        <p id="email-auth-notice-hint" class="email-sign-in__notice-hint">{{ t('emailAuth.approvalHint') }}</p>
        <button ref="noticeButton" class="email-sign-in__submit email-sign-in__notice-close" type="button" @click="dismissNotice">{{ t('emailAuth.noticeClose') }}</button>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { acceptEmailInvitation, inspectEmailInvitation, confirmEmailSignIn, inspectEmailSignIn, requestEmailSignIn } from '../api/email-auth';
import { useAuthStore } from '../stores/auth';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const email = ref('');
const busy = ref(false);
const inspecting = ref(false);
const notice = ref('');
const requestAccepted = ref(false);
const awaitingEmail = computed(() => requestAccepted.value || route.query?.sent === '1');
const waitingHeading = ref<HTMLHeadingElement | null>(null);
const requestButton = ref<HTMLButtonElement | null>(null);
const noticeButton = ref<HTMLButtonElement | null>(null);
watch(notice, async (value) => {
  await nextTick();
  if (value) noticeButton.value?.focus({ preventScroll: true });
  else if (awaitingEmail.value) waitingHeading.value?.focus({ preventScroll: true });
  else requestButton.value?.focus({ preventScroll: true });
});
const error = ref('');
const identity = ref<{ email: string; displayName?: string; firstSignIn?: boolean } | null>(null);
const invitation = ref(false);
const screenName = ref('');
let token = '';

async function dismissNotice() {
  if (!notice.value) return;
  notice.value = '';
  await router.replace('/signin?sent=1');
}
async function useAnotherAddress() {
  token = ''; invitation.value = false; screenName.value = ''; identity.value = null; error.value = ''; notice.value = '';
  requestAccepted.value = false; email.value = '';
  await router.replace('/signin');
  await nextTick();
  document.getElementById('unreeled-sign-in-email')?.focus();
}
async function readSignInLink() {
  if (window.location.pathname !== '/signin') return;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const isInvitation = fragment.has('invite');
  const nextToken = fragment.get(isInvitation ? 'invite' : 'token') ?? '';
  if (!nextToken) return;
  token = nextToken;
  invitation.value = isInvitation;
  screenName.value = '';
  requestAccepted.value = false;
  notice.value = '';
  identity.value = null;
  error.value = '';
  inspecting.value = true;
  // Remove the credential before any API request; never render or persist it.
  window.history.replaceState(window.history.state, '', '/signin');
  await router.replace('/signin');
  try {
    const result = await (isInvitation ? inspectEmailInvitation(nextToken) : inspectEmailSignIn(nextToken));
    if (token === nextToken) identity.value = result;
  } catch {
    if (token === nextToken) { error.value = t('emailAuth.invalidLink'); token = ''; }
  } finally { if (token === nextToken || token === '') inspecting.value = false; }
}
onMounted(readSignInLink);
watch(() => route.hash, readSignInLink);
onBeforeUnmount(() => { token = ''; });
async function requestLink() {
  if (busy.value || awaitingEmail.value) return;
  busy.value = true; error.value = ''; notice.value = '';
  try { await requestEmailSignIn(email.value); requestAccepted.value = true; notice.value = t('emailAuth.sent'); }
  catch (reason) { error.value = reason instanceof Error ? reason.message : t('emailAuth.failed'); }
  finally { busy.value = false; }
}
async function confirm() {
  if (busy.value || !token) return;
  busy.value = true; error.value = '';
  try {
    if (invitation.value) {
      await acceptEmailInvitation(token);
      token = ''; identity.value = null; invitation.value = false;
      requestAccepted.value = true; notice.value = t('emailAuth.sent');
      return;
    }
    if (identity.value?.firstSignIn) await confirmEmailSignIn(token, screenName.value.trim());
    else await confirmEmailSignIn(token);
    token = '';
    await auth.initialize(true);
    await router.replace('/');
  } catch (reason) { error.value = reason instanceof Error ? reason.message : t('emailAuth.invalidLink'); }
  finally { busy.value = false; }
}
</script>

<style scoped>
.email-sign-in__notice { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 1.5rem; background: rgb(0 0 0 / 40%); backdrop-filter: blur(4px); }
.email-sign-in__notice-card { box-sizing: border-box; width: 100%; max-width: 24rem; padding: 2rem; display: grid; justify-items: center; gap: 1rem; text-align: center; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 1.5rem; box-shadow: 0 24px 80px rgb(0 0 0 / 18%); }
.email-sign-in__notice-icon { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; border-radius: 50%; background: var(--surface-alt); color: var(--text); }
.email-sign-in__notice-title { margin: 0; font-size: 1.5rem; line-height: 1.25; font-weight: 700; letter-spacing: -0.025em; }
.email-sign-in__notice-body { margin: 0; font-size: 1rem; line-height: 1.6; color: var(--muted); }
.email-sign-in__notice-hint { box-sizing: border-box; margin: .25rem 0; padding: .875rem 1rem; border-radius: .75rem; background: var(--surface-alt); color: var(--muted); font-size: .8125rem; line-height: 1.5; }
.email-sign-in__notice-close { min-width: 8rem; min-height: 2.75rem; padding: .625rem 1.5rem; border: 1px solid var(--text); border-radius: 999px; font: inherit; font-weight: 600; cursor: pointer; }
.email-sign-in__notice-close:focus-visible { outline: 2px solid var(--text); outline-offset: 4px; }
.email-sign-in__notice[hidden] { display: none; }
.email-sign-in__promise { text-align: center; font-weight: 700; }
.email-sign-in__logo { width: 112px; height: 112px; object-fit: contain; mix-blend-mode: multiply; }
:global(:root[data-theme="dark"]) .email-sign-in__logo { filter: invert(1); mix-blend-mode: screen; }
.email-sign-in__submit { background: var(--text); color: var(--bg); border-color: var(--text); box-shadow: none; }
.email-sign-in__submit:hover { background: var(--text); color: var(--bg); opacity: 0.85; }
</style>

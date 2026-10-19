<template>
  <section class="min-h-screen px-6 py-10 flex items-center justify-center">
    <div class="card w-full max-w-[27rem] p-8 grid gap-5 text-center">
      <img class="review-logo justify-self-center" src="/branding/ur-logo-4e4dc1180945.png" alt="UnReeled" width="112" height="112" />
      <h1 class="m-0 text-2xl" :class="resultTitle ? 'font-bold' : 'font-semibold'">{{ resultTitle || t('emailReview.title') }}</h1>
      <p v-if="error" class="m-0 text-rose-600" role="alert">{{ error }}</p>
      <p v-else-if="result" class="m-0 break-words" role="status">{{ result }}</p>
      <form v-else-if="identity" class="grid gap-4" @submit.prevent="confirm">
        <p class="m-0 break-words">{{ t(decision === 'approve' ? 'emailReview.approveQuestion' : 'emailReview.denyQuestion', { email: identity.email }) }}</p>
        <p class="m-0 text-sm text-muted">{{ t('emailReview.explanation') }}</p>
        <button class="btn-primary review-submit justify-center" :disabled="busy" type="submit">{{ t(decision === 'approve' ? 'emailReview.approve' : 'emailReview.deny') }}</button>
        <button class="btn-primary review-submit justify-center" :disabled="busy" type="button" @click="decision = decision === 'approve' ? 'deny' : 'approve'">{{ t(decision === 'approve' ? 'emailReview.chooseDeny' : 'emailReview.chooseApprove') }}</button>
      </form>
      <p v-else class="m-0 text-muted" role="status">{{ t('emailReview.checking') }}</p>
    </div>
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { confirmEmailAccessReview, inspectEmailAccessReview } from '../api/email-auth';
const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const identity = ref<{ email: string } | null>(null);
const decision = ref<'approve' | 'deny'>('approve');
const busy = ref(false);
const error = ref('');
const result = ref('');
const resultTitle = ref('');
let token = '';
async function readLink() {
  if (window.location.pathname !== '/access/review') return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const nextToken = params.get('token') ?? '';
  if (!nextToken) { if (!token) error.value = t('emailReview.invalid'); return; }
  token = nextToken; identity.value = null; error.value = ''; result.value = ''; resultTitle.value = '';
  decision.value = params.get('decision') === 'deny' ? 'deny' : 'approve';
  // Bearer credentials never remain in the URL or rendered markup.
  window.history.replaceState(window.history.state, '', '/access/review');
  await router.replace('/access/review');
  try {
    const user = await inspectEmailAccessReview(nextToken);
    if (token === nextToken) identity.value = user;
  } catch { if (token === nextToken) { token = ''; error.value = t('emailReview.invalid'); } }
}
onMounted(readLink);
watch(() => route.hash, readLink);
onBeforeUnmount(() => { token = ''; });
async function confirm() {
  if (busy.value || !token) return;
  busy.value = true;
  const currentToken = token;
  const currentDecision = decision.value;
  try {
    const response = await confirmEmailAccessReview(currentToken, currentDecision);
    if (token !== currentToken) return;
    resultTitle.value = response.decision === 'approve' && response.emailSent ? t('emailReview.approvedTitle') : '';
    result.value = t(response.decision === 'deny' ? 'emailReview.denied' : response.emailSent ? 'emailReview.approved' : 'emailReview.approvedDeliveryFailed', { email: identity.value?.email ?? '' });
    identity.value = null; token = '';
  } catch { if (token === currentToken) error.value = t('emailReview.failed'); }
  finally { busy.value = false; }
}
</script>
<style scoped>
.review-logo { object-fit: contain; mix-blend-mode: multiply; }
:root[data-theme="dark"] .review-logo { filter: invert(1); mix-blend-mode: screen; }
.review-submit { background: var(--text); color: var(--bg); border-color: var(--text); box-shadow: none; }
.review-submit:hover { opacity: 0.85; }
</style>

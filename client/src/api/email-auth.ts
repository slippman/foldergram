import { requestJson } from './http';

export interface LibraryUser {
  id: number;
  email: string;
  display_name: string;
  access_status: 'pending' | 'approved' | 'banned';
  requested_at: number | null;
  last_requested_at: number | null;
  revoked_at: number | null;
  created_at: number;
  last_signed_in_at: number | null;
}
export interface LibraryUsersPayload {
  items: LibraryUser[];
  emailSignInEnabled: boolean;
  deliveryConfigured: boolean;
  reviewEmailConfigured?: boolean;
  sessionDays: number;
}
function post<T>(path: string, body: unknown) {
  return requestJson<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export const requestEmailSignIn = (email: string) => post<{ message: string }>('/api/auth/email/request', { email });
export const inspectEmailSignIn = (token: string) => post<{ email: string; displayName: string; firstSignIn?: boolean }>('/api/auth/email/inspect', { token });
export const confirmEmailSignIn = (token: string, screenName?: string) => post<{ ok: boolean }>('/api/auth/email/confirm', { token, screenName });
export const fetchLibraryUsers = () => requestJson<LibraryUsersPayload>('/api/admin/users');
export const deleteLibraryUser = (id: number) => requestJson<{ ok: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' });

export const approveAccessRequest = (id: number, displayName?: string) =>
  post<{ user: LibraryUser; emailSent: boolean }>(`/api/admin/users/${id}/approve`, { displayName: displayName?.trim() || undefined });

export const inspectEmailAccessReview = (token: string) => post<{ email: string }>('/api/auth/email/review/inspect', { token });
export const confirmEmailAccessReview = (token: string, decision: 'approve' | 'deny') =>
  post<{ decision: 'approve' | 'deny'; emailSent: boolean }>('/api/auth/email/review/confirm', { token, decision });

export const createEmailInvitation = (email: string) => post<{ link: string; expiresAt: number }>('/api/admin/users/invitations', { email });
export const inspectEmailInvitation = (token: string) => post<{ email: string }>('/api/auth/email/invitation/inspect', { token });
export const acceptEmailInvitation = (token: string) => post<{ ok: boolean }>('/api/auth/email/invitation/accept', { token });

export const rejectAccessRequest = (id: number) => post<{ ok: boolean }>(`/api/admin/users/${id}/reject`, {});

export const sendEmailInvitation = (email: string) => post<{ emailSent: boolean }>('/api/admin/users/invitations/send', { email });

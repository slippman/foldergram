import { requestJson } from './http';
export type ActivityPeriod = 'all' | 'today' | 'week';
export interface AccountActivity {
  id: number; email: string; joinedAt: number | null; lastLoginAt: number | null; loginCount: number;
  lastActiveAt: number | null; albumViews: number; uniqueAlbums: number; likes: number;
}
export interface ActivitySummary {
  items: AccountActivity[]; total: number; page: number; hasMore: boolean;
  timezone: string; captureStartedAt: number;
}
export interface SignedInActivity {
  items: { id: number; email: string; lastActiveAt: number | null; sessionCount: number }[];
  total: number; limit: number; timezone: string;
}
export const fetchSignedInActivity = () => requestJson<SignedInActivity>('/api/admin/activity/signed-in');
export interface ActivityDetail {
  albums: { albumKey: string; name: string; slug: string; views: number; lastViewedAt: number }[];
  likes: { id: number; folderSlug: string; folderName: string; filename: string; likedAt: string }[];
  detailLimit: number;
}
export const fetchActivity = (period: ActivityPeriod, page = 1) => requestJson<ActivitySummary>(`/api/admin/activity?period=${period}&page=${page}`);
export const fetchAccountActivity = (id: number, period: ActivityPeriod) => requestJson<ActivityDetail>(`/api/admin/activity/${id}?period=${period}`);
export const recordAlbumView = (slug: string, shared: boolean) => requestJson<void>(`/api/${shared ? 'share/' : ''}folders/${encodeURIComponent(slug)}/view`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

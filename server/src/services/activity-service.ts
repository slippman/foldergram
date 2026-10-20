import { createHash } from 'node:crypto';
import { appConfig } from '../config/env.js';
import { databaseManager } from '../db/database.js';
import type { FolderRecord } from '../types/models.js';

export type ActivityPeriod = 'all' | 'today' | 'week';
export function activityDay(now = Date.now(), timezone = appConfig.activityTimezone): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function startDay(period: ActivityPeriod): string | null {
  if (period === 'all') return null;
  const day = activityDay();
  if (period === 'today') return day;
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 6);
  return date.toISOString().slice(0, 10);
}
export const activityService = {
  touch(userId: number, now = Date.now()) {
    databaseManager.connection.prepare(`UPDATE library_users SET last_active_at = ? WHERE id = ? AND access_status = 'approved'
      AND (last_active_at IS NULL OR last_active_at < ?)`).run(now, userId, now - 300_000);
  },
  recordAlbum(userId: number, folder: FolderRecord, now = Date.now()) {
    // An opaque location key survives index rebuilds without storing source paths
    // or ever associating history through potentially reused numeric folder IDs.
    const key = createHash('sha256').update(folder.folder_path).digest('hex');
    databaseManager.connection.prepare(`INSERT INTO album_daily_views
      (user_id, album_key, album_slug, album_name, view_day, first_viewed_at, last_viewed_at)
      SELECT id, ?, ?, ?, ?, ?, ? FROM library_users WHERE id = ? AND access_status = 'approved'
      ON CONFLICT(user_id, album_key, view_day) DO UPDATE SET
        album_slug = excluded.album_slug, album_name = excluded.album_name,
        last_viewed_at = MAX(album_daily_views.last_viewed_at, excluded.last_viewed_at)`)
      .run(key, folder.slug, folder.name, activityDay(now), now, now, userId);
    this.touch(userId, now);
  },
  summary(period: ActivityPeriod, page: number, limit: number) {
    const db = databaseManager.connection;
    const day = startDay(period);
    const items = db.prepare(`SELECT u.id, u.email, u.last_signed_in_at AS lastLoginAt,
      u.login_count AS loginCount, u.last_active_at AS lastActiveAt,
      (SELECT COUNT(*) FROM album_daily_views v WHERE v.user_id=u.id AND (? IS NULL OR v.view_day>=?)) AS albumViews,
      (SELECT COUNT(DISTINCT album_key) FROM album_daily_views v WHERE v.user_id=u.id AND (? IS NULL OR v.view_day>=?)) AS uniqueAlbums,
      (SELECT COUNT(*) FROM user_likes l JOIN posts p ON p.id=l.post_id WHERE l.user_id=u.id AND p.is_deleted=0 AND p.is_trashed=0) AS likes
      FROM library_users u WHERE u.access_status='approved'
      ORDER BY COALESCE(u.last_active_at,u.last_signed_in_at,0) DESC,u.id DESC LIMIT ? OFFSET ?`)
      .all(day, day, day, day, limit, (page - 1) * limit);
    const total = (db.prepare("SELECT COUNT(*) AS n FROM library_users WHERE access_status='approved'").get() as { n: number }).n;
    return { items, total, page, limit, hasMore: page * limit < total, timezone: appConfig.activityTimezone,
      captureStartedAt: Number((db.prepare("SELECT value FROM app_settings WHERE key='activity.capture_started_at'").get() as { value: string }).value) };
  },
  detail(userId: number, period: ActivityPeriod) {
    const db = databaseManager.connection;
    const user = db.prepare('SELECT id,email FROM library_users WHERE id=?').get(userId);
    if (!user) return null;
    const day = startDay(period);
    const albums = db.prepare(`SELECT album_key AS albumKey, COUNT(*) AS views, MAX(last_viewed_at) AS lastViewedAt,
      (SELECT album_name FROM album_daily_views latest WHERE latest.user_id=v.user_id AND latest.album_key=v.album_key ORDER BY last_viewed_at DESC LIMIT 1) AS name,
      (SELECT album_slug FROM album_daily_views latest WHERE latest.user_id=v.user_id AND latest.album_key=v.album_key ORDER BY last_viewed_at DESC LIMIT 1) AS slug
      FROM album_daily_views v WHERE user_id=? AND (? IS NULL OR view_day>=?)
      GROUP BY album_key ORDER BY lastViewedAt DESC LIMIT 200`).all(userId, day, day);
    const likes = db.prepare(`SELECT p.id, f.slug AS folderSlug, f.name AS folderName, i.filename, l.created_at AS likedAt
      FROM user_likes l JOIN posts p ON p.id=l.post_id JOIN folders f ON f.id=p.folder_id
      JOIN post_items pi ON pi.post_id=p.id AND pi.position=1 JOIN images i ON i.id=pi.image_id
      WHERE l.user_id=? AND p.is_deleted=0 AND p.is_trashed=0 ORDER BY l.created_at DESC LIMIT 200`).all(userId);
    return { user, albums, likes, detailLimit: 200 };
  }
};

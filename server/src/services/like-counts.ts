import { databaseManager } from '../db/database.js';

// Called only for an already-authorized response. Do not use counts as an ID
// lookup endpoint or expose identities of people who liked a post.
export function appendLikeCounts<T>(payload: T, userId?: number): T {
  const ids = new Set<number>();
  function isPost(value: Record<string, unknown>): boolean {
    return Number.isSafeInteger(value.id) && Number(value.id) > 0
      && (typeof value.folderSlug === 'string' && typeof value.thumbnailUrl === 'string' || typeof value.liked === 'boolean');
  }
  function collect(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const record = value as Record<string, unknown>;
    if (isPost(record)) ids.add(Number(record.id));
    Object.values(record).forEach(collect);
  }
  collect(payload);
  if (!ids.size) return payload;
  const counts = new Map<number, number>();
  const personal = new Set<number>();
  const list = [...ids];
  for (let start = 0; start < list.length; start += 900) {
    const batch = list.slice(start, start + 900);
    const placeholders = batch.map(() => '?').join(',');
    const rows = databaseManager.connection.prepare(`SELECT post_id,COUNT(*) AS n FROM user_likes WHERE post_id IN (${placeholders}) GROUP BY post_id`).all(...batch) as { post_id: number; n: number }[];
    rows.forEach(row => counts.set(row.post_id, row.n));
    const shared = databaseManager.connection.prepare(`SELECT post_id FROM likes WHERE post_id IN (${placeholders})`).all(...batch) as { post_id: number }[];
    shared.forEach(row => counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1));
    if (userId !== undefined) {
      const liked = databaseManager.connection.prepare(`SELECT post_id FROM user_likes WHERE user_id=? AND post_id IN (${placeholders})`).all(userId,...batch) as {post_id:number}[];
      liked.forEach(row => personal.add(row.post_id));
    }
  }
  function visit(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(visit);
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    const record = value as Record<string, unknown>;
    const result = Object.fromEntries(Object.entries(record).map(([key, child]) => [key, visit(child)]));
    if (isPost(record)) {
      result.likeCount = counts.get(Number(record.id)) ?? 0;
      if (userId !== undefined) result.isLiked = personal.has(Number(record.id));
    }
    return result;
  }
  return visit(payload) as T;
}

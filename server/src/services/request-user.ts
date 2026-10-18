import { AsyncLocalStorage } from 'node:async_hooks';

// Account identity is established by authentication, never by a caller-supplied user ID.
const requestUser = new AsyncLocalStorage<number | null>();
export function withRequestUser<T>(id: number | null, work: () => T): T {
  if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid account identity.');
  return requestUser.run(id, work);
}
export function getRequestUserId(): number | null { return requestUser.getStore() ?? null; }

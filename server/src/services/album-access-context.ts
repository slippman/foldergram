import { AsyncLocalStorage } from 'node:async_hooks';

const albumAccess = new AsyncLocalStorage<boolean>();

// Internal indexing and maintenance retain full access. HTTP requests establish
// their scope after authentication; a share credential never changes that scope.
export function canReadLinkOnlyAlbums(): boolean { return albumAccess.getStore() ?? true; }
export function withAlbumAccess<T>(includeLinkOnly: boolean, work: () => T): T {
  return albumAccess.run(includeLinkOnly, work);
}

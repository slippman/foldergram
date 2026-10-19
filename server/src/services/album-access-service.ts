import { folderRepository } from '../db/repositories.js';
import { canReadLinkOnlyAlbums } from './album-access-context.js';

export function canReadAlbum(folderId: number): boolean {
  if (canReadLinkOnlyAlbums()) return true;
  const seen = new Set<number>();
  let id: number | null = folderId;
  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const folder = folderRepository.getById(id);
    if (!folder) return false;
    if (folder.role === 'normal') return folder.share_mode === 'library';
    id = folder.carousel_owner_folder_id ?? folder.story_owner_folder_id;
  }
  return false;
}

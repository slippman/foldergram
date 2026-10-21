import express from 'express';
import { z } from 'zod';
import { postRepository, folderRepository } from '../db/repositories.js';
import { requireCapability } from '../middleware/auth-protection.js';
import { galleryService } from '../services/gallery-service.js';
import { withRequestUser } from '../services/request-user.js';
import { activityService } from '../services/activity-service.js';
import { authService } from '../services/auth-service.js';
import { folderShareService } from '../services/folder-share-service.js';

export const activityRouter = express.Router();
const admin = requireCapability('canAccessSettings', 'Admin access is required.');
const periodSchema = z.enum(['all', 'today', 'week']).default('all');
activityRouter.get('/admin/activity', admin, (request, response) => {
  const query = z.object({ period: periodSchema, page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
  response.json(activityService.summary(query.period, query.page, query.limit));
});
activityRouter.get('/admin/activity/signed-in', admin, (_request, response) => {
  response.json(activityService.signedIn(authService.getSessionVersion()));
});
activityRouter.get('/admin/activity/:id', admin, (request, response) => {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  const { period } = z.object({ period: periodSchema }).parse(request.query);
  const detail = activityService.detail(id, period);
  if (!detail) { response.status(404).json({ message: 'Account not found.' }); return; }
  response.json(detail);
});
activityRouter.post(['/folders/:slug/view', '/share/folders/:slug/view'], (request, response) => {
  z.object({}).strict().parse(request.body ?? {});
  const { slug } = z.object({ slug: z.string().min(1).max(500) }).parse(request.params);
  const shared = /^\/share\//i.test(request.path);
  const folder = folderRepository.getNormalBySlug(slug);
  if (!folder || shared && !folderShareService.getFolderGrant(request, folder.id)) {
    response.status(shared ? 403 : 404).json({ message: 'Album access required.' }); return;
  }
  const user = authService.getRequestAuthContext(request).user;
  if (user) activityService.recordAlbum(user.id, folder);
  response.status(204).end();
});

activityRouter.route('/share/posts/:id/like').post(sharedLike).delete(sharedLike);
function sharedLike(request: express.Request, response: express.Response) {
  const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
  z.object({}).strict().parse(request.body ?? {});
  const user = authService.getRequestAuthContext(request).user;
  const post = postRepository.findById(id);
  if (!user || !post || !folderShareService.getFolderGrant(request, post.folder_id)) {
    response.status(403).json({message:'Album access required.'}); return;
  }
  const result = withRequestUser(user.id, () => request.method === 'POST' ? galleryService.likeImage(id) : galleryService.unlikeImage(id));
  if (!result) { response.status(404).json({message:'Post not found.'}); return; }
  activityService.touch(user.id);
  response.json(result);
}

import fs from 'node:fs';
import path from 'node:path';

import express from 'express';

import { appConfig, repositoryRoot } from './config/env.js';
import { requireApiAuthentication, requireMediaAuthentication } from './middleware/auth-protection.js';
import { handleRequestError } from './middleware/error-handler.js';
import { requireTrustedMutationRequest } from './middleware/csrf-protection.js';
import { blockPublicDemoMutations } from './middleware/public-demo-mode.js';
import { emailAuthRouter } from './routes/email-auth.js';
import { activityRouter } from './routes/activity.js';
import { log } from './services/log-service.js';
import { activityService } from './services/activity-service.js';
import { appendLikeCounts } from './services/like-counts.js';
import { apiRouter } from './routes/api.js';
import { sharePreviewRouter } from './routes/share-preview.js';
import { authService } from './services/auth-service.js';
import { lazyThumbnailsRouter, lazyPreviewsRouter } from './routes/lazy-derivatives.js';
import { createProtectedStaticOptions } from './utils/media-response.js';
import { cacheLibraryMediaUrls } from './services/shared-media-cache.js';
import { withRequestUser } from './services/request-user.js';
import { withAlbumAccess } from './services/album-access-context.js';
import { requireAlbumVisibility, requireDerivativeAlbumVisibility } from './middleware/album-visibility.js';
import { applySecurityHeaders } from './middleware/security-headers.js';

export function applyApiNoStoreHeaders(response: Pick<express.Response, 'setHeader'>) {
  authService.setNoStoreHeaders(response as express.Response);
  if (authService.isEnabled()) {
    response.setHeader('Vary', 'Cookie');
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(applySecurityHeaders);
  // Run before every public/static/share route as well as API authentication.
  // An empty replacement database must never become a passwordless production library.
  app.use((_request, response, next) => {
    if (!authService.isUnavailable()) { next(); return; }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Retry-After', '60');
    response.status(503).json({ message: 'Authentication storage is unavailable. Restore the configured authentication database.' });
  });

  // Public, versioned branding only; library media retains its own access/cache policy.
  app.use('/branding', express.static(path.join(repositoryRoot, 'client', appConfig.nodeEnv === 'production' ? 'dist' : 'public', 'branding'), {
    maxAge: '1y', immutable: true, dotfiles: 'deny'
  }));
  app.use('/branding', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.status(404).end();
  });
  app.use(express.json());
  app.use(sharePreviewRouter);

  if (appConfig.derivativeMode === 'lazy') {
    app.use('/thumbnails', requireMediaAuthentication, requireDerivativeAlbumVisibility('thumbnail'), lazyThumbnailsRouter);
    app.use('/previews', requireMediaAuthentication, requireDerivativeAlbumVisibility('preview'), lazyPreviewsRouter);
  } else {
    app.use('/thumbnails', requireMediaAuthentication, requireDerivativeAlbumVisibility('thumbnail'), express.static(appConfig.thumbnailsDir, createProtectedStaticOptions()));
    app.use('/previews', requireMediaAuthentication, requireDerivativeAlbumVisibility('preview'), express.static(appConfig.previewsDir, createProtectedStaticOptions()));
  }

  app.use('/api', (_request, response, next) => {
    applyApiNoStoreHeaders(response);
    next();
  });
  app.use('/api', blockPublicDemoMutations, requireTrustedMutationRequest, requireApiAuthentication);
  app.use('/api', (request, _response, next) => {
    const context = authService.getRequestAuthContext(request);
    const shared = /^\/share\//i.test(request.path);
    const discovery = /^\/(feed|reels|places|likes|collections)(\/|$)/i.test(request.path);
    withRequestUser(shared ? null : context.user?.id ?? null, () =>
      withAlbumAccess(shared || (!discovery && context.authenticated && context.role === 'admin'), next));
  });
  app.use('/api', requireAlbumVisibility);
  app.use('/api', (request, response, next) => {
    const userId = authService.getRequestAuthContext(request).user?.id;
    if (userId && /^\/(?:share\/)?(feed|folders|posts|images|reels|places|likes|collections)(\/|$)/i.test(request.path)) {
      response.on('finish', () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { activityService.touch(userId); } catch { log.error('Account activity update failed'); }
        }
      });
    }
    const json = response.json.bind(response);
    response.json = body => json(response.statusCode < 400 ? appendLikeCounts(body, userId) : body);
    next();
  });
  app.use('/api', (request, response, next) => {
    if (appConfig.mediaCacheEnabled && request.method === 'GET' && !/^\/(share|auth|admin)(\/|$)/.test(request.path)) {
      const json = response.json.bind(response);
      response.json = (body) => json(response.statusCode < 400 ? cacheLibraryMediaUrls(request, body) : body);
    }
    next();
  });
  app.use('/api', activityRouter);
  app.use('/api', emailAuthRouter);
  app.use('/api', apiRouter);

  if (appConfig.nodeEnv === 'production') {
    const clientDist = path.join(repositoryRoot, 'client', 'dist');
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
      app.get(/^(?!\/api|\/thumbnails|\/previews).*/, (_request, response) => {
        response.sendFile(path.join(clientDist, 'index.html'));
      });
    }
  }

  app.use(handleRequestError);

  return app;
}

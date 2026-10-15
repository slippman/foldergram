import fs from 'node:fs';
import path from 'node:path';

import express from 'express';

import { appConfig, repositoryRoot } from '../config/env.js';
import { folderShareService } from '../services/folder-share-service.js';
import { galleryService } from '../services/gallery-service.js';
import { serveDerivativeForImage } from './lazy-derivatives.js';

function albumShellHtml(): string | null {
  const indexPath = appConfig.nodeEnv === 'production'
    ? path.join(repositoryRoot, 'client/dist/index.html') : path.join(repositoryRoot, 'client/index.html');
  if (!fs.existsSync(indexPath)) return null;
  let html = fs.readFileSync(indexPath, 'utf8');
  if (galleryService.getAlbumDisplayTheme() === 'cinema') html = html.replace('<html ', '<html class="shared-album-entry" ');
  return html;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

// Prefer the matching public address, but proxies may rewrite the upstream Host.
// The fallback also comes only from explicit configuration, never forwarded headers.
function previewOrigin(request: express.Request): string | null {
  const host = request.get('host');
  const matchingOrigin = appConfig.csrfTrustedOrigins.find(origin => new URL(origin).host === host);
  if (matchingOrigin) return matchingOrigin;
  const configuredOrigin = appConfig.csrfTrustedOrigins.find(origin => origin.startsWith('https://'))
    ?? appConfig.csrfTrustedOrigins[0];
  if (configuredOrigin) return configuredOrigin;
  if (appConfig.nodeEnv !== 'production' && host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`;
  return null;
}

export const sharePreviewRouter = express.Router();

sharePreviewRouter.get(['/share/:slug', '/share/:slug/posts/:id', '/share/:slug/images/:id'], (request, response, next) => {
  let html = albumShellHtml();
  if (!html) return next();
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const slug = request.params.slug;
  const folder = typeof slug === 'string' ? folderShareService.getPreviewFolder(slug, request.query.preview) : null;
  const origin = previewOrigin(request);
  if (folder && origin) {
    const summary = galleryService.getFolderBySlug(folder.slug);
    const title = escapeHtml(folder.name);
    const tags = [
      `<meta property="og:title" content="${title}" />`,
      '<meta property="og:type" content="website" />',
      '<meta property="og:description" content="View this photo album" />',
      '<meta name="twitter:card" content="summary_large_image" />'
    ];
    if (summary?.avatarImageId) {
      const coverUrl = `${origin}/share-preview/${encodeURIComponent(folder.slug)}/cover.jpg?preview=${encodeURIComponent(String(request.query.preview))}`;
      tags.push(`<meta property="og:image" content="${escapeHtml(coverUrl)}" />`);
      tags.push('<meta property="og:image:type" content="image/jpeg" />');
      tags.push(`<meta name="twitter:image" content="${escapeHtml(coverUrl)}" />`);
    }
    html = html.replace('<title>Foldergram</title>', () => `<title>${title}</title>`);
    html = html.replace('</head>', () => `${tags.join('\n')}</head>`);
  }
  if (appConfig.nodeEnv !== 'production') {
    html = html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
  }
  response.type('html').send(html);
});

// Bootstrap branding for direct normal-album links before Vue fetches preferences.
sharePreviewRouter.get(['/f/:slug', '/folders/:slug'], (_request, response, next) => {
  let html = albumShellHtml();
  if (!html) return next();
  response.setHeader('Cache-Control', 'no-store');
  if (appConfig.nodeEnv !== 'production') html = html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
  response.type('html').send(html);
});

// This credential grants the cover only, never album browsing or originals.
sharePreviewRouter.get(['/share-preview/:slug/cover.jpg', '/share-preview/:slug/cover'], async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const slug = request.params.slug;
  const folder = typeof slug === 'string' ? folderShareService.getPreviewFolder(slug, request.query.preview) : null;
  const summary = folder ? galleryService.getFolderBySlug(folder.slug) : null;
  const image = summary?.avatarImageId ? galleryService.getShareDerivativeImage(summary.avatarImageId) : null;
  if (!folder || !image || image.folder_id !== folder.id) {
    response.status(404).end();
    return;
  }
  await serveDerivativeForImage(response, image, 'thumbnail', { noStore: true, jpeg: true });
});

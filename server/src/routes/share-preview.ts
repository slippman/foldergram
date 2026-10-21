import fs from 'node:fs';
import path from 'node:path';

import express from 'express';

import { appConfig, repositoryRoot } from '../config/env.js';
import { folderShareService } from '../services/folder-share-service.js';
import { galleryService } from '../services/gallery-service.js';
import { serveDerivativeForImage } from './lazy-derivatives.js';

function albumShellHtml(emailEntry = false, cinema = galleryService.getAlbumDisplayTheme() === 'cinema'): string | null {
  const indexPath = appConfig.nodeEnv === 'production'
    ? path.join(repositoryRoot, 'client/dist/index.html') : path.join(repositoryRoot, 'client/index.html');
  if (!fs.existsSync(indexPath)) return null;
  let html = fs.readFileSync(indexPath, 'utf8');
  // Production HTML contains the build-time value; development album shells bypass Vite.
  if (appConfig.nodeEnv !== 'production') {
    const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'client/viewer-config.json'), 'utf8'));
    const delay = config.loaderDelayMs;
    if (!Number.isInteger(delay) || delay < 0 || delay > 10000) throw new Error('Invalid viewer loader delay');
    html = html.replace('</head>', `<meta name="cinema-viewer-loader-delay-ms" content="${delay}"></head>`);
  }
  if (emailEntry || cinema) {
    html = html.replace('<html ', emailEntry ? '<html class="email-auth-entry" ' : '<html class="shared-album-entry" data-cinema-entry="true" ');
    html = html.replace('<title>Foldergram</title>', '<title>UnReeled Photos</title>');
    for (const [original, branded] of [
      ['/favicon.svg', '/branding/ur-favicon-9a5af93327d1.svg'],
      ['/icon-32.png', '/branding/ur-favicon-9a5af93327d1-32.png'],
      ['/icon-16.png', '/branding/ur-favicon-9a5af93327d1-16.png']
    ]) html = html.replace(`href="${original}"`, `href="${branded}" data-classic-href="${original}"`);
  }
  if (emailEntry) html = html.replace('<p>Loading album…</p>', '<p>Loading UnReeled Photos…</p>');
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

// Reels follow the feed theme, independently of the album theme.
sharePreviewRouter.get('/reels', (_request, response, next) => {
  const cinema = galleryService.getFeedDisplayTheme() === 'cinema';
  let html = albumShellHtml(false, cinema);
  if (!html) return next();
  if (cinema) html = html.replace('<p>Loading album…</p>', '<p>Loading reels…</p>');
  if (appConfig.nodeEnv !== 'production') html = html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
  response.setHeader('Cache-Control', 'no-store');
  response.type('html').send(html);
});

// Brand the email front door before Vue or authentication requests can finish.
sharePreviewRouter.get(['/', '/signin', '/admin', '/access/review'], (request, response, next) => {
  if (!appConfig.emailSignInEnabled) return next();
  let html = albumShellHtml(true);
  if (!html) return next();
  // Public invitation preview only: never include account, token, or album data.
  if (request.path === '/' && appConfig.emailSignInOrigin) {
    const origin = new URL(appConfig.emailSignInOrigin).origin;
    const image = escapeHtml(`${origin}/branding/ur-invitation-card-v1.png`);
    html = html.replace('</head>', [
      '<meta property="og:type" content="website" />',
      '<meta property="og:title" content="UnReeled Photos" />',
      '<meta property="og:description" content="A closer look at the good times." />',
      `<meta property="og:url" content="${escapeHtml(origin)}/" />`,
      `<meta property="og:image" content="${image}" />`,
      '<meta property="og:image:type" content="image/png" />',
      '<meta property="og:image:width" content="1200" />',
      '<meta property="og:image:height" content="630" />',
      '<meta property="og:image:alt" content="UR logo — UnReeled Photos. A closer look at the good times." />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:image" content="${image}" />`,
      '</head>'
    ].join('\n'));
  }
  response.setHeader('Cache-Control', 'no-store');
  if (appConfig.nodeEnv !== 'production') html = html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
  response.type('html').send(html);
});

// Redirects carry the original fragment token to the browser; GET never grants a session.
sharePreviewRouter.get('/s/:code', (request, response) => {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const target = folderShareService.resolveShortLink(request.params.code);
  if (!target) { response.status(404).type('text').send('Share link unavailable.'); return; }
  response.redirect(302, target);
});

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
    const tabTitle = galleryService.getAlbumDisplayTheme() === 'cinema' ? `${title} | UnReeled Photos` : title;
    html = html.replace(/<title>(?:Foldergram|UnReeled Photos)<\/title>/, () => `<title>${tabTitle}</title>`);
    html = html.replace('</head>', () => `${tags.join('\n')}</head>`);
  }
  if (appConfig.nodeEnv !== 'production') {
    html = html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
  }
  response.type('html').send(html);
});

// Bootstrap branding for direct albums and fullscreen posts before Vue fetches preferences.
sharePreviewRouter.get(['/f/:slug', '/folders/:slug', '/post/:id', '/image/:id'], (_request, response, next) => {
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

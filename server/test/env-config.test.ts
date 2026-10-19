import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type EnvModule = typeof import('../src/config/env.js');

describe.sequential('derivative mode env config', () => {
  let tempRoot = '';

  async function stubBaseEnv() {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATA_ROOT', path.join(tempRoot, 'data'));
    vi.stubEnv('GALLERY_ROOT', path.join(tempRoot, 'gallery'));
    vi.stubEnv('DB_DIR', path.join(tempRoot, 'db'));
    vi.stubEnv('THUMBNAILS_DIR', path.join(tempRoot, 'thumbnails'));
    vi.stubEnv('PREVIEWS_DIR', path.join(tempRoot, 'previews'));
  }

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'insta-env-config-'));
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('disables screen names by default and accepts an explicit later-phase opt-in', async () => {
    await stubBaseEnv();
    vi.stubEnv('EMAIL_SCREEN_NAMES_ENABLED', undefined);
    expect((await import('../src/config/env.js')).appConfig.emailScreenNamesEnabled).toBe(false);
    vi.resetModules(); vi.stubEnv('EMAIL_SCREEN_NAMES_ENABLED', 'true');
    expect((await import('../src/config/env.js')).appConfig.emailScreenNamesEnabled).toBe(true);
  });

  it.each([
    'http://photos.example.com',
    'https://photos.example.com/path',
    'https://name:password@photos.example.com',
    'https://photos.example.com/?token=value'
  ])('rejects an unsafe production email origin %s', async (origin) => {
    await stubBaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EMAIL_SIGN_IN_ORIGIN', origin);
    await expect(import('../src/config/env.js')).rejects.toThrow(/EMAIL_SIGN_IN_ORIGIN/);
  });

  it('accepts empty optional Compose email settings while leaving email sign-in disabled', async () => {
    await stubBaseEnv();
    for (const name of ['EMAIL_SIGN_IN_ORIGIN', 'EMAIL_FROM', 'RESEND_API_KEY', 'EMAIL_ACCESS_REVIEW_TO']) vi.stubEnv(name, '');
    const { appConfig } = await import('../src/config/env.js');
    expect(appConfig.emailSignInEnabled).toBe(false);
    expect(appConfig.resendApiKey).toBeUndefined();
  });

  it('reads an optional owner approval inbox and rejects malformed addresses', async () => {
    await stubBaseEnv(); vi.stubEnv('EMAIL_ACCESS_REVIEW_TO', 'owner@example.com');
    expect((await import('../src/config/env.js')).appConfig.emailAccessReviewTo).toBe('owner@example.com');
    vi.resetModules(); vi.stubEnv('EMAIL_ACCESS_REVIEW_TO', 'not an email');
    await expect(import('../src/config/env.js')).rejects.toThrow(/EMAIL_ACCESS_REVIEW_TO/);
  });

  it('uses preview and eager defaults when the new env vars are unset', async () => {
    await stubBaseEnv();
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    const { appConfig } = await import('../src/config/env.js') as EnvModule;

    expect(appConfig.imageDetailSource).toBe('preview');
    expect(appConfig.derivativeMode).toBe('eager');
    expect(appConfig.mediaCacheEnabled).toBe(false);
    expect(appConfig.mediaCacheTtlSeconds).toBe(86400);
    expect(appConfig.scanMediaErrorMode).toBe('skip');
    expect(appConfig.scanErrorReportDir).toBe(path.join(tempRoot, 'data', 'scan-errors'));
    expect(appConfig.galleryExcludedFolders).toEqual([]);
  });

  it('reads configurable media caching without changing the derivative mode', async () => {
    await stubBaseEnv();
    vi.stubEnv('MEDIA_CACHE_ENABLED', 'true');
    vi.stubEnv('MEDIA_CACHE_TTL_SECONDS', '3600');
    const { appConfig } = await import('../src/config/env.js') as EnvModule;
    expect(appConfig.mediaCacheEnabled).toBe(true);
    expect(appConfig.mediaCacheTtlSeconds).toBe(3600);
    expect(appConfig.derivativeMode).toBe('eager');
  });

  it.each(['0', '-1', '1.5', '604801', 'invalid'])('rejects invalid cache lifetime %s', async (ttl) => {
    await stubBaseEnv();
    vi.stubEnv('MEDIA_CACHE_TTL_SECONDS', ttl);
    await expect(import('../src/config/env.js')).rejects.toThrow();
  });

  it('allows strict scan failure on media errors when requested', async () => {
    await stubBaseEnv();
    vi.stubEnv('SCAN_MEDIA_ERROR_MODE', 'fail');
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    const { appConfig } = await import('../src/config/env.js') as EnvModule;

    expect(appConfig.scanMediaErrorMode).toBe('fail');
  });

  it('parses excluded folder env rules with trimming and dedupe', async () => {
    await stubBaseEnv();
    vi.stubEnv('GALLERY_EXCLUDED_FOLDERS', ' @eaDir , thumbnails , Archive/cache , @eaDir ');
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    const { appConfig } = await import('../src/config/env.js') as EnvModule;

    expect(appConfig.galleryExcludedFolders).toEqual(['@eaDir', 'thumbnails', 'Archive/cache']);
  });

  it('rejects invalid enum values for derivative-related env vars', async () => {
    await stubBaseEnv();
    vi.stubEnv('IMAGE_DETAIL_SOURCE', 'fullres');
    vi.stubEnv('DERIVATIVE_MODE', 'background');
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    await expect(import('../src/config/env.js')).rejects.toThrow();
  });

  it('requires initialized authentication by default in production, with an explicit local opt-out', async () => {
    await stubBaseEnv();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_REQUIRED', undefined);
    const { appConfig } = await import('../src/config/env.js');
    expect(appConfig.authRequired).toBe(true);
    vi.resetModules();
    vi.stubEnv('AUTH_REQUIRED', 'false');
    expect((await import('../src/config/env.js')).appConfig.authRequired).toBe(false);
  });

  it('rejects invalid excluded folder env rules', async () => {
    await stubBaseEnv();
    vi.stubEnv('GALLERY_EXCLUDED_FOLDERS', '../outside,*/cache');
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    await expect(import('../src/config/env.js')).rejects.toThrow();
  });

  it('rejects derivative directories that overlap scan error reports', async () => {
    await stubBaseEnv();
    vi.stubEnv('THUMBNAILS_DIR', path.join(tempRoot, 'data'));
    vi.doMock('dotenv', () => ({
      default: {
        config: vi.fn()
      }
    }));

    await expect(import('../src/config/env.js')).rejects.toThrow(/scan error reports/i);
  });
});

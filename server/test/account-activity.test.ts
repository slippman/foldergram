import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTestApp as request } from './http-test-utils.js';

describe.sequential('account activity', () => {
  let root: string;
  let app: express.Application;
  let repo: typeof import('../src/db/repositories.js');
  let accounts: typeof import('../src/db/email-account-repository.js')['emailAccountRepository'];
  let activity: typeof import('../src/services/activity-service.js');
  let auth: typeof import('../src/services/auth-service.js')['authService'];
  let admin: string;
  let alice: { id: number; cookie: string };
  let bob: { id: number; cookie: string };
  let album: ReturnType<typeof repo.folderRepository.upsert>;
  let postId: number;
  const intent = { 'x-foldergram-intent': '1' };
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'account-activity-'));
    for (const [key, value] of Object.entries({ NODE_ENV: 'test', DATA_ROOT: path.join(root,'data'), DB_DIR: path.join(root,'db'), GALLERY_ROOT: path.join(root,'gallery'), THUMBNAILS_DIR: path.join(root,'thumbs'), PREVIEWS_DIR: path.join(root,'previews'), EMAIL_SIGN_IN_ENABLED: 'true', ACTIVITY_TIMEZONE: 'America/Denver' })) vi.stubEnv(key,value);
  });
  beforeEach(async () => {
    (await import('../src/db/database.js')).databaseManager.close(); vi.resetModules();
    await fs.rm(root,{recursive:true,force:true});
    await Promise.all(['db','data','gallery','thumbs','previews'].map(dir=>fs.mkdir(path.join(root,dir),{recursive:true})));
    repo = await import('../src/db/repositories.js');
    accounts = (await import('../src/db/email-account-repository.js')).emailAccountRepository;
    activity = await import('../src/services/activity-service.js');
    auth = (await import('../src/services/auth-service.js')).authService;
    auth.setAdminPassword('admin-password-123');
    const response = { cookie: vi.fn(), setHeader: vi.fn() };
    auth.setAuthenticatedSession(response as any, { secure:false,get:()=>undefined } as any,'admin');
    const [name,value] = response.cookie.mock.calls.at(-1)!; admin=`${name}=${value}`;
    alice = session('alice@example.com'); bob = session('bob@example.com');
    album = repo.folderRepository.upsert({slug:'trip',name:'Trip',folderPath:'private/trip'});
    const image = repo.imageRepository.upsert({folderId:album.id,filename:'photo.jpg',extension:'.jpg',relativePath:'private/trip/photo.jpg',absolutePath:path.join(root,'gallery/private/trip/photo.jpg'),fileSize:100,width:100,height:100,mediaType:'image',mimeType:'image/jpeg',durationMs:null,fingerprint:'fixture',mtimeMs:1,firstSeenAt:new Date().toISOString(),sortTimestamp:1,takenAt:1,takenAtSource:'exif',exifJson:null,thumbnailPath:'trip.webp',previewPath:'trip.webp'});
    postId=repo.postRepository.findByImageId(image.id)!.id;
    app=(await import('../src/app.js')).createApp();
  });
  afterAll(async()=>{(await import('../src/db/database.js')).databaseManager.close();vi.unstubAllEnvs();vi.resetModules();await fs.rm(root,{recursive:true,force:true});});
  function session(email:string) {
    const user=accounts.approve(email,email.split('@')[0]);
    const token=randomBytes(32).toString('base64url'), rawSession=randomBytes(32).toString('base64url');
    accounts.createSignInToken(user.id,hash(token),Date.now()+60_000);
    accounts.redeem(hash(token),hash(rawSession),auth.getSessionVersion(),Date.now()+86400_000);
    return {id:user.id,cookie:`foldergram_email_session=${rawSession}`};
  }
  const get=(url:string,cookie=admin)=>request(app,'GET',url,{cookie});
  const view=(slug='trip',cookie=alice.cookie,body={})=>request(app,'POST',`/api/folders/${slug}/view`,{...intent,cookie},body);

  it('counts Monday/Tuesday/Wednesday once per person and album per day, with separate unique albums',async()=>{
    for(const time of ['2026-10-19T18:00Z','2026-10-20T18:00Z','2026-10-20T20:00Z','2026-10-21T18:00Z']) activity.activityService.recordAlbum(alice.id,album,Date.parse(time));
    activity.activityService.recordAlbum(bob.id,album,Date.parse('2026-10-20T18:00Z'));
    const report=(await get('/api/admin/activity')).body;
    expect(report.items.find((user:any)=>user.id===alice.id)).toMatchObject({albumViews:3,uniqueAlbums:1,joinedAt:accounts.getById(alice.id)!.created_at});
    expect(report.items.find((user:any)=>user.id===bob.id)).toMatchObject({albumViews:1,uniqueAlbums:1});
    const other=repo.folderRepository.upsert({slug:'birthday',name:'Birthday',folderPath:'birthday'});
    activity.activityService.recordAlbum(alice.id,other);
    expect((await get('/api/admin/activity')).body.items.find((user:any)=>user.id===alice.id)).toMatchObject({albumViews:4,uniqueAlbums:2});
  });
  it('uses Denver calendar dates across midnight and daylight-saving boundaries',()=>{
    expect(activity.activityDay(Date.parse('2026-10-20T05:59Z'))).toBe('2026-10-19');
    expect(activity.activityDay(Date.parse('2026-10-20T06:00Z'))).toBe('2026-10-20');
    expect(activity.activityDay(Date.parse('2026-11-01T07:30Z'))).toBe('2026-11-01');
    expect(activity.activityDay(Date.parse('2026-11-01T08:30Z'))).toBe('2026-11-01');
  });
  it('does not count probes, refreshes, inspection, status polling or failed album loads as album visits',async()=>{
    await get('/api/folders/trip',alice.cookie); await get('/api/auth/status',alice.cookie);
    expect((await view('missing')).status).toBe(404);
    expect((await get('/api/admin/activity')).body.items.every((user:any)=>user.albumViews===0)).toBe(true);
    await Promise.all([view(),view(),view()]);
    expect((await get('/api/admin/activity')).body.items.find((user:any)=>user.id===alice.id).albumViews).toBe(1);
  });
  it('requires CSRF, ignores no client identity, and keeps reports private',async()=>{
    expect((await request(app,'POST','/api/folders/trip/view',{cookie:alice.cookie},{})).status).toBe(403);
    expect((await view('trip',alice.cookie,{userId:bob.id,viewDay:'2020-01-01'})).status).toBe(400);
    expect((await get('/api/admin/activity',alice.cookie)).status).toBe(403);
    expect((await get(`/api/admin/activity/${bob.id}`,alice.cookie)).status).toBe(403);
    expect((await get('/api/admin/activity','')).status).toBe(401);
    expect((await view()).status).toBe(204);
    expect((await get('/api/admin/activity')).headers.get('cache-control')).toContain('no-store');
  });
  it('records signed-in scoped shares without broadening link-only album access',async()=>{
    repo.folderRepository.setShareMode('trip','link-only');
    expect((await view()).status).toBe(404);
    expect((await request(app,'POST','/api/share/folders/trip/view',{...intent,cookie:alice.cookie},{})).status).toBe(403);
    const shares=(await import('../src/services/folder-share-service.js')).folderShareService;
    const link=shares.createLink('trip',{expiresAt:null})!; const grant=shares.verifyLinkToken('trip',link.rawToken)!;
    const response={cookie:vi.fn(),setHeader:vi.fn()};shares.setShareSession(response as any,{secure:false,get:()=>undefined} as any,grant);
    const [name,value]=response.cookie.mock.calls.at(-1)!;
    const cookie=`${alice.cookie}; ${name}=${value}`;
    expect((await request(app,'POST','/api/share/folders/trip/view',{...intent,cookie},{})).status).toBe(204);
    expect((await get('/api/folders/trip',cookie)).status).toBe(404);
    const liked=await request(app,'POST',`/api/share/posts/${postId}/like`,{...intent,cookie});
    expect(liked.status).toBe(200);expect(liked.body.likeCount).toBe(1);
    expect((await get(`/api/share/posts/${postId}`,cookie)).body.isLiked).toBe(true);
    expect((await get('/api/likes',cookie)).body.items).toEqual([]);
    expect((await request(app,'POST',`/api/share/posts/${postId}/like`,{...intent,cookie:alice.cookie})).status).toBe(403);
    expect((await get('/api/admin/activity')).body.items.find((user:any)=>user.id===alice.id).albumViews).toBe(1);
  });
  it('updates last activity for likes and shared browsing, but not status polling',async()=>{
    const db=(await import('../src/db/database.js')).databaseManager.connection;
    const old=Date.now()-600000;db.prepare('UPDATE library_users SET last_active_at=? WHERE id=?').run(old,alice.id);
    await get('/api/auth/status',alice.cookie);expect(accounts.getById(alice.id)!.last_active_at).toBe(old);
    await request(app,'POST',`/api/posts/${postId}/like`,{...intent,cookie:alice.cookie});
    expect(accounts.getById(alice.id)!.last_active_at).toBeGreaterThan(old);
    db.prepare('UPDATE library_users SET last_active_at=? WHERE id=?').run(old,alice.id);
    await get('/api/share/folders/trip',alice.cookie);
    expect(accounts.getById(alice.id)!.last_active_at).toBeGreaterThan(old);
  });
  it('increments logins only when a one-use token is redeemed',()=>{
    const tokenHash=hash('a-new-token'); accounts.createSignInToken(alice.id,tokenHash,Date.now()+60000);
    accounts.getSignInUser(tokenHash);accounts.getSignInUser(tokenHash);
    expect(accounts.getById(alice.id)!.login_count).toBe(1);
    expect(accounts.redeem(tokenHash,hash('new-session'),auth.getSessionVersion(),Date.now()+60000)).not.toBeNull();
    expect(accounts.redeem(tokenHash,hash('replay-session'),auth.getSessionVersion(),Date.now()+60000)).toBeNull();
    expect(accounts.getById(alice.id)!.login_count).toBe(2);
  });
  it('returns aggregate counts only for authorized photos and keeps who-liked-what admin-only',async()=>{
    const {withRequestUser}=await import('../src/services/request-user.js');
    withRequestUser(alice.id,()=>repo.likeRepository.upsert(postId));
    withRequestUser(bob.id,()=>repo.likeRepository.upsert(postId));
    const photo=await get(`/api/posts/${postId}`,alice.cookie);
    expect(photo.body.likeCount).toBe(2);expect(JSON.stringify(photo.body)).not.toContain('bob@example.com');
    const result=await request(app,'DELETE',`/api/posts/${postId}/like`,{...intent,cookie:alice.cookie});
    expect(result.body.likeCount).toBe(1);
    expect((await get(`/api/admin/activity/${bob.id}`)).body.likes[0].id).toBe(postId);
    repo.folderRepository.setShareMode('trip','link-only');
    expect((await get(`/api/posts/${postId}`,alice.cookie)).status).toBe(404);
    expect((await get('/api/feed',alice.cookie)).body.items).toEqual([]);
  });
  it('retains album facts across index rebuild and deletes them with the account even if foreign keys are off',async()=>{
    activity.activityService.recordAlbum(alice.id,album);
    repo.maintenanceRepository.resetLibraryIndex();
    const rebuilt=repo.folderRepository.upsert({slug:'trip',name:'Renamed Trip',folderPath:'private/trip'});
    activity.activityService.recordAlbum(alice.id,rebuilt);
    expect((await get(`/api/admin/activity/${alice.id}`)).body.albums).toHaveLength(1);
    expect((await get(`/api/admin/activity/${alice.id}`)).body.albums[0]).toMatchObject({name:'Renamed Trip',views:1});
    const db=(await import('../src/db/database.js')).databaseManager.connection;db.exec('PRAGMA foreign_keys=OFF');
    accounts.deleteUser(alice.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM album_daily_views WHERE user_id=?').get(alice.id)).toEqual({n:0});
  });
});

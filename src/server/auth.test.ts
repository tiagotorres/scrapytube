import { afterEach, describe, expect, it } from 'vitest';

import * as helpers from './test-helpers.ts';
import { SETUP, TestClient } from './test-helpers.ts';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function createTestApp() {
  const test = helpers.createTestApp();
  cleanups.push(test.cleanup);
  return test;
}

async function setUpApp() {
  const test = await helpers.setUpApp();
  cleanups.push(test.cleanup);
  return test;
}

describe('first-time setup', () => {
  it('creates the first user, and signs in', async () => {
    const { app } = createTestApp();
    const client = new TestClient(app);

    const before = await client.get('/api/session');
    expect(before.body).toMatchObject({ setupRequired: true, user: null, version: 'test' });

    const res = await client.post('/api/setup', SETUP);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Tiago', username: 'tiago', language: 'en' });
    expect(client.cookie).toMatch(/^scrapytube_session=.+/);

    const after = await client.get('/api/session');
    expect(after.body).toMatchObject({ setupRequired: false, user: { username: 'tiago' } });
  });

  it('can only happen once', async () => {
    const { app } = await setUpApp();
    const res = await new TestClient(app).post('/api/setup', { ...SETUP, username: 'other' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('SETUP_DONE');
  });

  it('validates the input', async () => {
    const { app } = createTestApp();
    const res = await new TestClient(app).post('/api/setup', { ...SETUP, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BAD_REQUEST');
  });
});

describe('signing in', () => {
  it('requires a session for the API', async () => {
    const { app } = await setUpApp();
    const res = await new TestClient(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
  });

  it('signs in with the username in any case, and out again', async () => {
    const { app } = await setUpApp();
    const client = new TestClient(app);

    const wrong = await client.post('/api/login', { username: 'tiago', password: 'nope nope' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error).toBe('INVALID_CREDENTIALS');

    const unknown = await client.post('/api/login', { username: 'nobody', password: 'correct horse' });
    expect(unknown.body.error).toBe('INVALID_CREDENTIALS');

    const ok = await client.post('/api/login', { username: ' Tiago ', password: 'correct horse' });
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe('tiago');
    expect((await client.get('/api/users')).status).toBe(200);

    const session = client.cookie;
    expect((await client.post('/api/logout')).status).toBe(204);
    expect((await client.get('/api/users')).status).toBe(401);
    // The old cookie no longer works either.
    client.cookie = session;
    expect((await client.get('/api/users')).status).toBe(401);
  });

  it('slows down password guessing', async () => {
    const { app } = await setUpApp();
    const client = new TestClient(app);
    for (let i = 0; i < 10; i++) {
      await client.post('/api/login', { username: 'tiago', password: `guess ${i}` });
    }
    const res = await client.post('/api/login', { username: 'tiago', password: 'correct horse' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('RATE_LIMITED');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('also slows down guesses sent all at once', async () => {
    const { app } = await setUpApp();
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        new TestClient(app).post('/api/login', { username: 'tiago', password: `guess ${i}` }),
      ),
    );
    const statuses = results.map(res => res.status);
    expect(statuses.filter(status => status === 401).length).toBeLessThanOrEqual(10);
    expect(statuses.filter(status => status === 429).length).toBeGreaterThanOrEqual(20);
  });

  it('renews the cookie while the app is used, so active people stay signed in', async () => {
    const { app, client, db } = await setUpApp();
    const headers = { cookie: client.cookie };
    expect((await app.request('/api/users', { headers })).headers.get('set-cookie')).toBeNull();

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET last_seen_at = ?').run(twoHoursAgo);
    const renewed = await app.request('/api/users', { headers });
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get('set-cookie')).toMatch(/^scrapytube_session=.+Max-Age=2592000/);
  });

  it('rejects changes without the app header (cross-site requests)', async () => {
    const { app, client } = await setUpApp();
    const res = await app.request('/api/folders', {
      method: 'POST',
      headers: { cookie: client.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ parent: '', name: 'abc' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects bodies that are not JSON', async () => {
    const { app, client } = await setUpApp();
    const res = await app.request('/api/folders', {
      method: 'POST',
      headers: { cookie: client.cookie, 'x-scrapytube': '1', 'content-type': 'text/plain' },
      body: 'name=abc',
    });
    expect(res.status).toBe(415);
  });
});

describe('own account', () => {
  it('changes the name and language', async () => {
    const { client } = await setUpApp();
    const res = await client.patch('/api/me', { name: '  Tiago   T. ', language: 'pt-PT' });
    expect(res.body).toMatchObject({ name: 'Tiago T.', language: 'pt-PT' });
  });

  it('changes the password, keeping this device signed in and signing out the others', async () => {
    const { app, client } = await setUpApp();
    const phone = new TestClient(app);
    await phone.post('/api/login', { username: 'tiago', password: 'correct horse' });

    const wrong = await client.post('/api/me/password', {
      currentPassword: 'nope',
      newPassword: 'battery staple',
    });
    expect(wrong.body.error).toBe('WRONG_PASSWORD');

    const ok = await client.post('/api/me/password', {
      currentPassword: 'correct horse',
      newPassword: 'battery staple',
    });
    expect(ok.status).toBe(204);
    expect((await client.get('/api/users')).status).toBe(200);
    expect((await phone.get('/api/users')).status).toBe(401);

    const login = await new TestClient(app).post('/api/login', {
      username: 'tiago',
      password: 'battery staple',
    });
    expect(login.status).toBe(200);
  });
});

describe('API basics', () => {
  it('answers health checks without a session', async () => {
    const { app } = await setUpApp();
    const res = await new TestClient(app).get('/api/health');
    expect(res.body).toEqual({ ok: true, version: 'test' });
  });

  it('sends the version and no-store on API responses', async () => {
    const { client } = await setUpApp();
    const res = await client.get('/api/users');
    expect(res.headers.get('x-app-version')).toBe('test');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const { client } = await setUpApp();
    const res = await client.get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('downloads a copy of the database', async () => {
    const { app, client } = await setUpApp();
    const res = await app.request('/api/backup', { headers: { cookie: client.cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="scrapytube-.+\.db"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');
  });
});

describe('users', () => {
  it('lets everyone manage everyone, except removing themselves', async () => {
    const { client, addUser } = await setUpApp();
    const ana = await addUser('ana', 'Ana');
    const users = (await ana.get('/api/users')).body as { id: number; username: string; language: string }[];
    expect(users.map(user => user.username).sort()).toEqual(['ana', 'tiago']);
    expect(users.find(user => user.username === 'ana')?.language).toBe('fr');

    const tiago = users.find(user => user.username === 'tiago')!;
    expect((await ana.patch(`/api/users/${tiago.id}`, { name: 'Tiago T.' })).body.name).toBe('Tiago T.');

    expect((await client.delete(`/api/users/${tiago.id}`)).body.error).toBe('CANNOT_REMOVE_SELF');

    const anaId = users.find(user => user.username === 'ana')!.id;
    expect((await client.delete(`/api/users/${anaId}`)).status).toBe(204);
    expect((await ana.get('/api/users')).status).toBe(401);
  });

  it('refuses a username that is taken', async () => {
    const { client } = await setUpApp();
    const res = await client.post('/api/users', { name: 'Other', username: 'TIAGO', password: 'long enough', language: 'en' });
    expect(res.body.error).toBe('USERNAME_TAKEN');
  });

  it('signs a person out everywhere when their password is reset', async () => {
    const { app, client, addUser } = await setUpApp();
    const ana = await addUser('ana');
    const id = ((await ana.get('/api/session')).body.user as { id: number }).id;
    expect((await client.post(`/api/users/${id}/password`, { password: 'brand new pass' })).status).toBe(204);
    expect((await ana.get('/api/users')).status).toBe(401);
    const again = new TestClient(app);
    expect((await again.post('/api/login', { username: 'ana', password: 'brand new pass' })).status).toBe(200);
  });
});

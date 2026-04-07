import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];

afterAll(async () => {
  await cleanupTestUsers(testEmails);
  await prisma.carnival.deleteMany({ where: { name: { startsWith: 'Test Carnival' } } });
});

async function makeUser(role: 'admin' | 'coordinator' | 'operator' | 'viewer' = 'coordinator') {
  const email = `carnival-test+${role}+${Date.now()}@example.com`;
  testEmails.push(email);
  return createTestUser({ email, role });
}

describe('Carnival routes', () => {
  describe('GET /carnivals', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/carnivals');
      expect(res.status).toBe(401);
    });

    it('returns carnival list for authenticated user', async () => {
      const { token } = await makeUser('admin');
      const res = await request(app).get('/carnivals').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /carnivals', () => {
    it('creates a carnival with default settings', async () => {
      const { token } = await makeUser('coordinator');
      const name = `Test Carnival ${Date.now()}`;

      const res = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(name);
      expect(res.body.settings).toBeDefined();
      expect(res.body.settings.openAge).toBe(99);
      expect(res.body.settings.title).toBe(name);
    });

    it('rejects duplicate name (case-insensitive)', async () => {
      const { token } = await makeUser('admin');
      const name = `Test Carnival Dupe ${Date.now()}`;
      await request(app).post('/carnivals').set('Authorization', `Bearer ${token}`).send({ name });

      const res = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: name.toUpperCase() });

      expect(res.status).toBe(409);
    });

    it('returns 403 for operator role', async () => {
      const { token } = await makeUser('operator');
      const res = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Blocked Carnival' });
      expect(res.status).toBe(403);
    });

    it('returns 400 for empty name', async () => {
      const { token } = await makeUser('coordinator');
      const res = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '  ' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /carnivals/:id', () => {
    it('returns 403 when user has no access to carnival', async () => {
      const { token: adminToken } = await makeUser('admin');
      const { token: otherToken } = await makeUser('coordinator');

      const createRes = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Test Carnival Access ${Date.now()}` });

      const res = await request(app)
        .get(`/carnivals/${createRes.body.id}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('returns carnival detail with summary for admin', async () => {
      const { token } = await makeUser('admin');
      const createRes = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Test Carnival Detail ${Date.now()}` });

      const res = await request(app)
        .get(`/carnivals/${createRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.competitorCount).toBe(0);
    });
  });

  describe('PUT /carnivals/:id', () => {
    it('updates carnival name and settings', async () => {
      const { token } = await makeUser('coordinator');
      const createRes = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Test Carnival Update ${Date.now()}` });

      const id = createRes.body.id;
      const newName = `Test Carnival Updated ${Date.now()}`;

      const res = await request(app)
        .put(`/carnivals/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: newName, settings: { footer: 'New Footer' } });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(newName);
    });
  });

  describe('DELETE /carnivals/:id', () => {
    it('returns 400 without confirm=true', async () => {
      const { token } = await makeUser('admin');
      const createRes = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Test Carnival Delete ${Date.now()}` });

      const res = await request(app)
        .delete(`/carnivals/${createRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('deletes a carnival with confirm=true', async () => {
      const { token } = await makeUser('admin');
      const createRes = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Test Carnival Delete2 ${Date.now()}` });

      const res = await request(app)
        .delete(`/carnivals/${createRes.body.id}?confirm=true`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(204);
    });
  });

  describe('POST /carnivals/:id/copy', () => {
    it('copies a carnival with a new name', async () => {
      const { token } = await makeUser('coordinator');
      const src = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Test Carnival Source ${Date.now()}` });

      const res = await request(app)
        .post(`/carnivals/${src.body.id}/copy`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Test Carnival Copy ${Date.now()}` });

      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe(src.body.id);
      expect(res.body.settings).toBeDefined();
    });
  });
});

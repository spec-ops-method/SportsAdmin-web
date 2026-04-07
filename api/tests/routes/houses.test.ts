import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];
let carnivalId: number;
let coordinatorToken: string;

beforeAll(async () => {
  const email = `house-test+${Date.now()}@example.com`;
  testEmails.push(email);
  const { token } = await createTestUser({ email, role: 'coordinator' });
  coordinatorToken = token;

  const res = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ name: `House Test Carnival ${Date.now()}` });
  carnivalId = res.body.id;
});

afterAll(async () => {
  await prisma.carnival.deleteMany({ where: { id: carnivalId } });
  await cleanupTestUsers(testEmails);
});

describe('House routes', () => {
  let houseId: number;

  describe('POST /carnivals/:id/houses', () => {
    it('creates a house', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/houses`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ code: 'RED', name: 'Red House' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('RED');
      expect(res.body.totalPoints).toBe(0);
      houseId = res.body.id;
    });

    it('rejects duplicate house code within same carnival', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/houses`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ code: 'RED', name: 'Another Red' });

      expect(res.status).toBe(409);
    });

    it('allows same code in different carnival', async () => {
      const { token } = await createTestUser({ role: 'coordinator' });
      const cv = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Isolated Carnival ${Date.now()}` });

      const res = await request(app)
        .post(`/carnivals/${cv.body.id}/houses`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: 'RED', name: 'Same Code Different Carnival' });

      expect(res.status).toBe(201);
      await prisma.carnival.delete({ where: { id: cv.body.id } });
    });

    it('returns 400 for empty code', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/houses`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ code: '', name: 'No Code' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /carnivals/:id/houses', () => {
    it('returns all houses for the carnival', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/houses`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((h: { code: string }) => h.code === 'RED')).toBe(true);
    });
  });

  describe('PUT /carnivals/:id/houses/:houseId', () => {
    it('updates house name', async () => {
      const res = await request(app)
        .put(`/carnivals/${carnivalId}/houses/${houseId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: 'Updated Red House' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Red House');
    });
  });

  describe('POST /carnivals/:id/houses/:houseId/points-extra', () => {
    it('creates a points adjustment', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/houses/${houseId}/points-extra`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ points: 10, reason: 'Spirit award' });

      expect(res.status).toBe(201);
      expect(res.body.points).toBe(10);
    });
  });

  describe('DELETE /carnivals/:id/houses/:houseId', () => {
    it('returns 400 without confirm=true', async () => {
      const res = await request(app)
        .delete(`/carnivals/${carnivalId}/houses/${houseId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(res.status).toBe(400);
    });

    it('deletes a house with confirm=true', async () => {
      const res = await request(app)
        .delete(`/carnivals/${carnivalId}/houses/${houseId}?confirm=true`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(res.status).toBe(204);
    });
  });
});

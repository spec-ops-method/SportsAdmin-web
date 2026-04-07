import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];
let carnivalId: number;
let houseId: number;
let coordinatorToken: string;

beforeAll(async () => {
  const email = `competitor-test+${Date.now()}@example.com`;
  testEmails.push(email);
  const { token } = await createTestUser({ email, role: 'coordinator' });
  coordinatorToken = token;

  const carnivalRes = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ name: `Competitor Test Carnival ${Date.now()}` });
  carnivalId = carnivalRes.body.id;

  const houseRes = await request(app)
    .post(`/carnivals/${carnivalId}/houses`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ code: 'RED', name: 'Red House' });
  houseId = houseRes.body.id;
});

afterAll(async () => {
  await prisma.carnival.deleteMany({ where: { id: carnivalId } });
  await cleanupTestUsers(testEmails);
});

describe('Competitor routes', () => {
  let competitorId: number;

  // ─── Auth guard ────────────────────────────────────────────────────────────

  describe('Unauthenticated access', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get(`/carnivals/${carnivalId}/competitors`);
      expect(res.status).toBe(401);
    });
  });

  // ─── Create ────────────────────────────────────────────────────────────────

  describe('POST /carnivals/:id/competitors', () => {
    it('creates a competitor with dob → age is calculated', async () => {
      // DOB of 2010-01-01, carnival cutoff default Jan 1 → age = currentYear - 2010
      const currentYear = new Date().getFullYear();
      const expectedAge = currentYear - 2010;

      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          givenName: 'Alice',
          surname:   'Smith',
          sex:       'F',
          houseId,
          dob:       '2010-01-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.givenName).toBe('Alice');
      expect(res.body.surname).toBe('Smith');
      expect(res.body.age).toBe(expectedAge);
      expect(res.body.dob).toBe('2010-01-01');
      expect(res.body.fullName).toBe(`SMITH, Alice`);
      expect(res.body.houseCode).toBe('RED');
      expect(res.body.events).toBeUndefined(); // not in create response
      competitorId = res.body.id;
    });

    it('creates a competitor with age only → dob derived as Jan 1', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          givenName: 'Bob',
          surname:   'Jones',
          sex:       'M',
          houseId,
          age:       12,
        });

      expect(res.status).toBe(201);
      expect(res.body.age).toBe(12);
      // DOB is derived as Jan 1 of (currentYear - age)
      expect(res.body.dob).toMatch(/^\d{4}-01-01$/);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ givenName: 'No', surname: 'Fields', sex: 'M' }); // missing houseId and age/dob

      expect(res.status).toBe(400);
    });

    it('returns 404 for invalid houseId', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({
          givenName: 'Ghost',
          surname:   'User',
          sex:       'M',
          houseId:   999999,
          age:       10,
        });

      expect(res.status).toBe(404);
    });
  });

  // ─── List ──────────────────────────────────────────────────────────────────

  describe('GET /carnivals/:id/competitors', () => {
    it('returns 200 with pagination structure', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(typeof res.body.pagination.page).toBe('number');
      expect(typeof res.body.pagination.perPage).toBe('number');
      expect(typeof res.body.pagination.total).toBe('number');
    });

    it('filters by search term', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/competitors?search=Alice`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.some((c: { givenName: string }) => c.givenName === 'Alice')).toBe(true);
    });
  });

  // ─── Get single ────────────────────────────────────────────────────────────

  describe('GET /carnivals/:id/competitors/:id', () => {
    it('returns competitor with events stub', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/competitors/${competitorId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(competitorId);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events).toHaveLength(0);
    });
  });

  // ─── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /carnivals/:id/competitors/:id', () => {
    it('updates competitor name', async () => {
      const res = await request(app)
        .patch(`/carnivals/${carnivalId}/competitors/${competitorId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ givenName: 'Alicia' });

      expect(res.status).toBe(200);
      expect(res.body.givenName).toBe('Alicia');
    });

    it('updates houseId and reflects new houseCode', async () => {
      // Create a second house
      const newHouseRes = await request(app)
        .post(`/carnivals/${carnivalId}/houses`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ code: 'BLUE', name: 'Blue House' });
      const newHouseId = newHouseRes.body.id;

      const res = await request(app)
        .patch(`/carnivals/${carnivalId}/competitors/${competitorId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ houseId: newHouseId });

      expect(res.status).toBe(200);
      expect(res.body.houseCode).toBe('BLUE');
    });
  });

  // ─── Quick-add ─────────────────────────────────────────────────────────────

  describe('POST /carnivals/:id/competitors/quick-add', () => {
    it('creates a new competitor via quick-add', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors/quick-add`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ givenName: 'Charlie', surname: 'Brown', sex: 'M', age: 10, houseId });

      expect(res.status).toBe(201);
      expect(res.body.givenName).toBe('Charlie');
    });

    it('returns 409 with existing_competitor on duplicate quick-add', async () => {
      // Create first
      await request(app)
        .post(`/carnivals/${carnivalId}/competitors/quick-add`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ givenName: 'Dana', surname: 'White', sex: 'F', age: 11, houseId });

      // Attempt duplicate
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors/quick-add`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ givenName: 'dana', surname: 'white', sex: 'F', age: 11, houseId });

      expect(res.status).toBe(409);
      expect(res.body.existing_competitor).toBeDefined();
      expect(res.body.existing_competitor.givenName).toBe('Dana');
    });
  });

  // ─── Bulk update ───────────────────────────────────────────────────────────

  describe('PATCH /carnivals/:id/competitors/bulk', () => {
    it('bulk-updates include=false for given competitor IDs', async () => {
      // Ensure we have a competitor to target
      const listRes = await request(app)
        .get(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      const ids = listRes.body.data.slice(0, 2).map((c: { id: number }) => c.id);

      const res = await request(app)
        .patch(`/carnivals/${carnivalId}/competitors/bulk`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ competitorIds: ids, updates: { include: false } });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Roll-over ─────────────────────────────────────────────────────────────

  describe('POST /carnivals/:id/competitors/roll-over', () => {
    it('returns 400 without confirm=true', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors/roll-over`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(400);
    });

    it('increments all competitor ages with confirm=true', async () => {
      const beforeRes = await request(app)
        .get(`/carnivals/${carnivalId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      const sampleAge = beforeRes.body.data[0]?.age;

      const res = await request(app)
        .post(`/carnivals/${carnivalId}/competitors/roll-over?confirm=true`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.updated).toBe('number');

      if (sampleAge !== undefined) {
        const afterRes = await request(app)
          .get(`/carnivals/${carnivalId}/competitors/${beforeRes.body.data[0].id}`)
          .set('Authorization', `Bearer ${coordinatorToken}`);
        expect(afterRes.body.age).toBe(sampleAge + 1);
      }
    });
  });
});

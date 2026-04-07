import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];
let coordinatorToken: string;
let carnivalId: number;
let houseId: number;
let competitorId: number;
let eventTypeId: number;
let eventId: number;
let heatId: number;
let compEventId: number;

beforeAll(async () => {
  const email = `results-test+${Date.now()}@example.com`;
  testEmails.push(email);
  const { token } = await createTestUser({ email, role: 'coordinator' });
  coordinatorToken = token;

  // Create carnival
  const carnivalRes = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ name: `Results Test Carnival ${Date.now()}` });
  carnivalId = carnivalRes.body.id;

  // Create house
  const houseRes = await request(app)
    .post(`/carnivals/${carnivalId}/houses`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ code: 'BLU', name: 'Blue House' });
  houseId = houseRes.body.id;

  // Create competitor
  const compRes = await request(app)
    .post(`/carnivals/${carnivalId}/competitors`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ givenName: 'Bob', surname: 'Jones', sex: 'M', age: 14, houseCode: 'BLU' });
  competitorId = compRes.body.id;

  // Create event type (Seconds = ASC)
  const etRes = await request(app)
    .post(`/carnivals/${carnivalId}/event-types`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ description: '100m Sprint', units: 'Seconds', laneCount: 4 });
  eventTypeId = etRes.body.id;

  // Create event division
  const eventRes = await request(app)
    .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/events`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ sex: 'M', age: '14' });
  eventId = eventRes.body.id;

  // Set up final levels
  await request(app)
    .put(`/carnivals/${carnivalId}/event-types/${eventTypeId}/final-levels`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send([
      { finalLevel: 0, numHeats: 1, promotionType: 'NONE', useTimes: true, promoteCount: 0, effectsRecords: true },
    ]);

  // Generate heats
  await request(app)
    .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/generate-heats?confirm=true`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ clearExisting: true });

  // Get the heat
  const orderRes = await request(app)
    .get(`/carnivals/${carnivalId}/event-order`)
    .set('Authorization', `Bearer ${coordinatorToken}`);
  if (orderRes.body.length > 0) {
    heatId = orderRes.body[0].heatId;
  }

  // Enter competitor in heat
  await request(app)
    .post(`/carnivals/${carnivalId}/heats/${heatId}/competitors`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ competitorId, lane: 1 });

  // Get comp event id
  const heatRes = await request(app)
    .get(`/carnivals/${carnivalId}/heats/${heatId}`)
    .set('Authorization', `Bearer ${coordinatorToken}`);
  compEventId = heatRes.body.compEvents[0]?.id;
});

afterAll(async () => {
  await (prisma as any).carnival.deleteMany({ where: { id: carnivalId } });
  await cleanupTestUsers(testEmails);
});

describe('Results routes', () => {
  // ─── Comp event PATCH ─────────────────────────────────────────────────────

  describe('PATCH /:carnivalId/comp-events/:compEventId', () => {
    it('1. valid result → 200, result set', async () => {
      const res = await request(app)
        .patch(`/carnivals/${carnivalId}/comp-events/${compEventId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ result: '12.34' });

      expect(res.status).toBe(200);
      expect(res.body.result).toBe('12.34');
      expect(res.body.numericResult).toBeCloseTo(12.34);
    });

    it('2. invalid result → 400', async () => {
      const res = await request(app)
        .patch(`/carnivals/${carnivalId}/comp-events/${compEventId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ result: 'not-a-time' });

      expect(res.status).toBe(400);
    });

    it('3. clear result (empty string) → 200, numericResult=0', async () => {
      const res = await request(app)
        .patch(`/carnivals/${carnivalId}/comp-events/${compEventId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ result: '' });

      expect(res.status).toBe(200);
      expect(res.body.result).toBeNull();
      expect(res.body.numericResult).toBe(0);
    });
  });

  // ─── Calculate places ─────────────────────────────────────────────────────

  describe('POST /:carnivalId/heats/:heatId/calculate-places', () => {
    it('4. calculates places → 200, updated > 0', async () => {
      // First set a result so there's something to calculate
      await request(app)
        .patch(`/carnivals/${carnivalId}/comp-events/${compEventId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ result: '11.00' });

      const res = await request(app)
        .post(`/carnivals/${carnivalId}/heats/${heatId}/calculate-places`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('updated');
      expect(res.body.updated).toBeGreaterThan(0);
    });

    it('5. dontOverridePlaces → 409', async () => {
      // Set dontOverridePlaces on the heat
      await request(app)
        .patch(`/carnivals/${carnivalId}/heats/${heatId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ dontOverridePlaces: true });

      const res = await request(app)
        .post(`/carnivals/${carnivalId}/heats/${heatId}/calculate-places`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({});

      expect(res.status).toBe(409);

      // Reset it
      await request(app)
        .patch(`/carnivals/${carnivalId}/heats/${heatId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ dontOverridePlaces: false });
    });
  });

  // ─── Point scales ─────────────────────────────────────────────────────────

  describe('Point scale CRUD', () => {
    it('6. create point scale → 201', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/point-scales`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: 'Standard' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Standard');
      expect(res.body.carnivalId).toBe(carnivalId);
    });

    it('7. duplicate point scale name → 409', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/point-scales`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: 'Standard' });

      expect(res.status).toBe(409);
    });

    it('8. PUT entries on scale → 200 with entriesSet', async () => {
      const res = await request(app)
        .put(`/carnivals/${carnivalId}/point-scales/Standard/entries`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send([
          { place: 1, points: 10 },
          { place: 2, points: 7 },
          { place: 3, points: 5 },
        ]);

      expect(res.status).toBe(200);
      expect(res.body.entriesSet).toBe(3);
    });

    it('9. delete point scale in use → 409', async () => {
      // Attach scale to heat
      await request(app)
        .patch(`/carnivals/${carnivalId}/heats/${heatId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ pointScale: 'Standard' });

      const res = await request(app)
        .delete(`/carnivals/${carnivalId}/point-scales/Standard`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(409);

      // Detach scale from heat
      await request(app)
        .patch(`/carnivals/${carnivalId}/heats/${heatId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ pointScale: null });
    });
  });

  // ─── Recalculate points ───────────────────────────────────────────────────

  describe('POST /:carnivalId/recalculate-points', () => {
    it('10. without confirm → 400', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/recalculate-points`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('11. with confirm=true → 200 with counts', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/recalculate-points?confirm=true`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('compEventsUpdated');
      expect(res.body).toHaveProperty('competitorsUpdated');
    });
  });
});

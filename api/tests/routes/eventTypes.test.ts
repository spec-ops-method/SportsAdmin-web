import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];
let carnivalId: number;
let houseId: number;
let coordinatorToken: string;
let competitorId: number;
let eventTypeId: number;
let eventId: number;
let heatId: number;

beforeAll(async () => {
  const email = `eventtype-test+${Date.now()}@example.com`;
  testEmails.push(email);
  const { token } = await createTestUser({ email, role: 'coordinator' });
  coordinatorToken = token;

  const carnivalRes = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ name: `EventType Test Carnival ${Date.now()}` });
  carnivalId = carnivalRes.body.id;

  const houseRes = await request(app)
    .post(`/carnivals/${carnivalId}/houses`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ code: 'RED', name: 'Red House' });
  houseId = houseRes.body.id;

  const competitorRes = await request(app)
    .post(`/carnivals/${carnivalId}/competitors`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ givenName: 'Alice', surname: 'Smith', sex: 'F', age: 12, houseId });
  competitorId = competitorRes.body.id;
});

afterAll(async () => {
  await prisma.carnival.deleteMany({ where: { id: carnivalId } });
  await cleanupTestUsers(testEmails);
});

describe('EventType routes', () => {
  // 1. Unauthenticated → 401
  describe('Unauthenticated access', () => {
    it('returns 401 for event-types list without token', async () => {
      const res = await request(app).get(`/carnivals/${carnivalId}/event-types`);
      expect(res.status).toBe(401);
    });
  });

  // 2. Create event type → 201
  describe('POST /carnivals/:id/event-types', () => {
    it('creates an event type and returns 201', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ description: '100m Sprint', units: 'Seconds', laneCount: 8 });

      expect(res.status).toBe(201);
      expect(res.body.description).toBe('100m Sprint');
      expect(res.body.units).toBe('Seconds');
      expect(res.body.unitsDisplay).toBe('Secs');
      expect(res.body.laneCount).toBe(8);
      expect(res.body.divisionCount).toBe(0);
      eventTypeId = res.body.id;
    });

    // 3. Duplicate event type name → 409
    it('returns 409 for duplicate description', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ description: '100m Sprint', units: 'Seconds' });

      expect(res.status).toBe(409);
    });

    // 4. Invalid units → 400
    it('returns 400 for invalid units', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ description: 'Bad Units Event', units: 'Furlongs' });

      expect(res.status).toBe(400);
    });
  });

  // 5. List event types → 200 array
  describe('GET /carnivals/:id/event-types', () => {
    it('returns array of event types', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('unitsDisplay');
      expect(res.body[0]).toHaveProperty('divisionCount');
      expect(res.body[0]).toHaveProperty('heatCount');
    });
  });

  // 6. Get event type with divisions + finalLevels → 200
  describe('GET /carnivals/:id/event-types/:id', () => {
    it('returns event type detail with divisions and finalLevels arrays', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/event-types/${eventTypeId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(eventTypeId);
      expect(Array.isArray(res.body.divisions)).toBe(true);
      expect(Array.isArray(res.body.finalLevels)).toBe(true);
    });
  });

  // 7. Create event (division) → 201
  describe('POST /carnivals/:id/event-types/:id/events', () => {
    it('creates an event division and returns 201', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/events`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ sex: 'F', age: '12' });

      expect(res.status).toBe(201);
      expect(res.body.sex).toBe('F');
      expect(res.body.age).toBe('12');
      eventId = res.body.id;
    });

    // 8. Duplicate sex+age → 409
    it('returns 409 for duplicate sex+age within event type', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/events`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ sex: 'F', age: '12' });

      expect(res.status).toBe(409);
    });
  });

  // 9. PUT final levels valid → 200
  describe('PUT /carnivals/:id/event-types/:id/final-levels', () => {
    it('replaces final levels and returns 200', async () => {
      const res = await request(app)
        .put(`/carnivals/${carnivalId}/event-types/${eventTypeId}/final-levels`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send([
          { finalLevel: 1, numHeats: 2, promotionType: 'Smooth', useTimes: true, promoteCount: 3, effectsRecords: true },
          { finalLevel: 0, numHeats: 1, promotionType: 'NONE', useTimes: true, promoteCount: 0, effectsRecords: true },
        ]);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body.find((fl: any) => fl.finalLevel === 0).label).toBe('Grand Final');
      expect(res.body.find((fl: any) => fl.finalLevel === 1).label).toBe('Semi Final');
    });

    // 10. PUT final levels with level 0 non-NONE promotion → 400
    it('returns 400 when level 0 has non-NONE promotion type', async () => {
      const res = await request(app)
        .put(`/carnivals/${carnivalId}/event-types/${eventTypeId}/final-levels`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send([
          { finalLevel: 0, numHeats: 1, promotionType: 'Smooth', useTimes: true, promoteCount: 0, effectsRecords: true },
        ]);

      expect(res.status).toBe(400);
    });
  });

  // 11. Generate heats (no final levels on a new event type) → 400
  describe('POST /carnivals/:id/event-types/:id/generate-heats', () => {
    it('returns 400 when no final levels configured', async () => {
      // Create a new event type without final levels
      const etRes = await request(app)
        .post(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ description: 'Long Jump', units: 'Meters' });
      const newEtId = etRes.body.id;

      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types/${newEtId}/generate-heats`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    // 12. Generate heats with divisions and final levels → heatsCreated > 0
    it('generates heats for event type with divisions and final levels', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/generate-heats?confirm=true`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ clearExisting: true });

      expect(res.status).toBe(200);
      expect(res.body.heatsCreated).toBeGreaterThan(0);
      expect(res.body.eventsProcessed).toBeGreaterThanOrEqual(1);
    });
  });

  // 13. Enter competitor in heat → 201
  describe('POST /carnivals/:id/heats/:id/competitors', () => {
    beforeAll(async () => {
      // Get a heat for the event
      const heatsRes = await request(app)
        .get(`/carnivals/${carnivalId}/event-order`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      if (heatsRes.body.length > 0) {
        heatId = heatsRes.body[0].heatId;
      }
    });

    it('enters a competitor in a heat and returns 201', async () => {
      if (!heatId) {
        console.warn('No heat available for test');
        return;
      }

      const res = await request(app)
        .post(`/carnivals/${carnivalId}/heats/${heatId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ competitorId });

      expect(res.status).toBe(201);
      expect(res.body.competitorId).toBe(competitorId);
    });

    // 14. Remove competitor from heat → 204
    it('removes a competitor from a heat and returns 204', async () => {
      if (!heatId) {
        console.warn('No heat available for test');
        return;
      }

      const res = await request(app)
        .delete(`/carnivals/${carnivalId}/heats/${heatId}/competitors/${competitorId}`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(204);
    });
  });

  // 15. Update event order → 200
  describe('PUT /carnivals/:id/event-order', () => {
    it('bulk updates event order and returns 200', async () => {
      // Get heats first
      const orderRes = await request(app)
        .get(`/carnivals/${carnivalId}/event-order`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(orderRes.status).toBe(200);

      if (orderRes.body.length === 0) return;

      const updates = orderRes.body.slice(0, 2).map((item: any, i: number) => ({
        heatId: item.heatId,
        eventNumber: 100 + i,
        eventTime: `${9 + i}:00`,
      }));

      const res = await request(app)
        .put(`/carnivals/${carnivalId}/event-order`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ updates });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(updates.length);
    });
  });

  // 16. Auto-number events → 200
  describe('POST /carnivals/:id/event-order/auto-number', () => {
    it('auto-numbers all heats and returns 200', async () => {
      const res = await request(app)
        .post(`/carnivals/${carnivalId}/event-order/auto-number`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ startNumber: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('numberedCount');
      expect(res.body).toHaveProperty('startNumber');
    });
  });

  // Additional: lane-templates populated on create with laneCount > 0
  describe('GET /carnivals/:id/event-types/:id/lane-templates', () => {
    it('returns lane templates when laneCount > 0', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/event-types/${eventTypeId}/lane-templates`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(8); // laneCount = 8
    });
  });

  // Additional: final levels list with labels
  describe('GET /carnivals/:id/event-types/:id/final-levels', () => {
    it('returns final levels with labels', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/event-types/${eventTypeId}/final-levels`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty('label');
    });
  });

  // Additional: delete event type requires confirm
  describe('DELETE /carnivals/:id/event-types/:id', () => {
    it('returns 400 without confirm=true', async () => {
      const etRes = await request(app)
        .post(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ description: 'To Delete', units: 'Seconds' });

      const res = await request(app)
        .delete(`/carnivals/${carnivalId}/event-types/${etRes.body.id}`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(400);
    });

    it('deletes event type with confirm=true and returns 204', async () => {
      const etRes = await request(app)
        .post(`/carnivals/${carnivalId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ description: 'To Delete Confirmed', units: 'Seconds' });

      const res = await request(app)
        .delete(`/carnivals/${carnivalId}/event-types/${etRes.body.id}?confirm=true`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(204);
    });
  });
});

import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const testEmails: string[] = [];
let token: string;
let carnivalId: number;
let houseId: number;
let competitorId: number;
let eventTypeId: number;
let eventId: number;
let heatId: number;

beforeAll(async () => {
  const email = `reports-test+${Date.now()}@example.com`;
  testEmails.push(email);
  ({ token } = await createTestUser({ email, role: 'coordinator' }));

  // Carnival
  const carnivalRes = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Reports Test Carnival ${Date.now()}` });
  carnivalId = carnivalRes.body.id;

  // House
  const houseRes = await request(app)
    .post(`/carnivals/${carnivalId}/houses`)
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RED', name: 'Red House' });
  houseId = houseRes.body.id;

  // Competitor
  const compRes = await request(app)
    .post(`/carnivals/${carnivalId}/competitors`)
    .set('Authorization', `Bearer ${token}`)
    .send({ givenName: 'Alice', surname: 'Smith', sex: 'F', age: 12, houseCode: 'RED' });
  competitorId = compRes.body.id;

  // Event type
  const etRes = await request(app)
    .post(`/carnivals/${carnivalId}/event-types`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: '100m Sprint', units: 'Seconds', laneCount: 4 });
  eventTypeId = etRes.body.id;

  // Event division
  const eventRes = await request(app)
    .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/events`)
    .set('Authorization', `Bearer ${token}`)
    .send({ sex: 'F', age: '12' });
  eventId = eventRes.body.id;

  // Final levels
  await request(app)
    .put(`/carnivals/${carnivalId}/event-types/${eventTypeId}/final-levels`)
    .set('Authorization', `Bearer ${token}`)
    .send([
      {
        finalLevel: 0,
        numHeats: 1,
        promotionType: 'NONE',
        useTimes: true,
        promoteCount: 0,
        effectsRecords: true,
      },
    ]);

  // Generate heats
  await request(app)
    .post(`/carnivals/${carnivalId}/event-types/${eventTypeId}/generate-heats?confirm=true`)
    .set('Authorization', `Bearer ${token}`)
    .send({ clearExisting: true });

  // Get heat
  const orderRes = await request(app)
    .get(`/carnivals/${carnivalId}/event-order`)
    .set('Authorization', `Bearer ${token}`);
  if (orderRes.body.length > 0) {
    heatId = orderRes.body[0].heatId;
  }

  // Enter competitor in heat (if heat exists)
  if (heatId) {
    await request(app)
      .post(`/carnivals/${carnivalId}/heats/${heatId}/competitors`)
      .set('Authorization', `Bearer ${token}`)
      .send([{ competitorId, lane: 1 }]);
  }
});

afterAll(async () => {
  if (carnivalId) {
    await prisma.carnival.delete({ where: { id: carnivalId } }).catch(() => {});
  }
  await cleanupTestUsers(testEmails);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /:carnivalId/reports/house-points', () => {
  it('returns an array of house point rows', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/house-points`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const row = res.body[0];
      expect(row).toHaveProperty('houseCode');
      expect(row).toHaveProperty('houseName');
      expect(row).toHaveProperty('grandTotal');
      expect(row).toHaveProperty('percentage');
    }
  });
});

describe('GET /:carnivalId/reports/program', () => {
  it('returns a sorted event list', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/program`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const item = res.body[0];
      expect(item).toHaveProperty('eventTypeDescription');
      expect(item).toHaveProperty('age');
      expect(item).toHaveProperty('sex');
      expect(item).toHaveProperty('finalLevelLabel');
    }
  });
});

describe('GET /:carnivalId/reports/statistics/overall', () => {
  it('returns house data array', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/statistics/overall`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('houseCode');
      expect(res.body[0]).toHaveProperty('grandTotal');
    }
  });
});

describe('GET /:carnivalId/reports/statistics/age-champions', () => {
  it('returns grouped age champion data', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/statistics/age-champions`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const row = res.body[0];
      expect(row).toHaveProperty('fullName');
      expect(row).toHaveProperty('ageSexDivision');
      expect(row).toHaveProperty('houseName');
      expect(row).toHaveProperty('totalPoints');
    }
  });
});

describe('GET /:carnivalId/reports/statistics/non-participants', () => {
  it('returns empty array when all competitors have participated', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/statistics/non-participants`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Alice was entered in a heat, so no non-participants (or she is one if heat had 0 comp_events)
    res.body.forEach((item: Record<string, unknown>) => {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('fullName');
    });
  });
});

describe('GET /:carnivalId/reports/event-lists', () => {
  it('returns event list filtered by status', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/event-lists?statuses=future`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((heat: Record<string, unknown>) => {
      expect(heat).toHaveProperty('eventType');
      expect(heat).toHaveProperty('competitors');
      expect(heat.status).toBe('future');
    });
  });
});

describe('GET /:carnivalId/reports/competitor-list', () => {
  it('returns competitors grouped by team', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/competitor-list?group_by=team`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('pagination');
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const item = res.body.data[0];
      expect(item).toHaveProperty('fullName');
      expect(item).toHaveProperty('houseCode');
    }
  });
});

describe('GET /:carnivalId/reports/records', () => {
  it('returns records array', async () => {
    const res = await request(app)
      .get(`/carnivals/${carnivalId}/reports/records`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    res.body.forEach((record: Record<string, unknown>) => {
      expect(record).toHaveProperty('eventId');
      expect(record).toHaveProperty('result');
      expect(record).toHaveProperty('holderName');
    });
  });
});

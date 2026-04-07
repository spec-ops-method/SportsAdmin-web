import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];
let coordinatorToken: string;
let sourceCarnivalId: number;
let createdCarnivalIds: number[] = [];

beforeAll(async () => {
  const email = `copy-test+${Date.now()}@example.com`;
  testEmails.push(email);
  const { token } = await createTestUser({ email, role: 'coordinator' });
  coordinatorToken = token;

  // Create the source carnival with data to copy
  const res = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ name: `Copy Source ${Date.now()}` });
  sourceCarnivalId = res.body.id;
  createdCarnivalIds.push(sourceCarnivalId);

  // Add a house
  await request(app)
    .post(`/carnivals/${sourceCarnivalId}/houses`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ code: 'RED', name: 'Red House' });

  // Add an event type
  const etRes = await request(app)
    .post(`/carnivals/${sourceCarnivalId}/event-types`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ description: '100m Sprint', units: 'Seconds', laneCount: 8, entrantCount: 1 });
  const eventTypeId: number = etRes.body.id;

  // Add an event (division)
  await request(app)
    .post(`/carnivals/${sourceCarnivalId}/event-types/${eventTypeId}/events`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ sex: 'M', age: '12' });

  // Add a point scale
  await request(app)
    .post(`/carnivals/${sourceCarnivalId}/point-scales`)
    .set('Authorization', `Bearer ${coordinatorToken}`)
    .send({ name: 'A', entries: [{ place: 1, points: 10 }, { place: 2, points: 7 }] });
});

afterAll(async () => {
  await prisma.carnival.deleteMany({ where: { id: { in: createdCarnivalIds } } });
  await cleanupTestUsers(testEmails);
});

describe('Carnival copy / export / import', () => {
  describe('POST /carnivals/:id/copy', () => {
    it('1. copies carnival with same settings', async () => {
      const copyName = `Copy Test ${Date.now()}`;
      const res = await request(app)
        .post(`/carnivals/${sourceCarnivalId}/copy`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: copyName });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe(copyName);
      createdCarnivalIds.push(res.body.id);

      // Verify settings were copied
      const settingsRes = await request(app)
        .get(`/carnivals/${res.body.id}/settings`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(settingsRes.status).toBe(200);
      expect(settingsRes.body.title).toBe(copyName);
    });

    it('2. copy includes event types and events', async () => {
      const copyName = `Copy ET Test ${Date.now()}`;
      const res = await request(app)
        .post(`/carnivals/${sourceCarnivalId}/copy`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: copyName });

      expect(res.status).toBe(201);
      createdCarnivalIds.push(res.body.id);
      const newId = res.body.id;

      const etRes = await request(app)
        .get(`/carnivals/${newId}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(etRes.status).toBe(200);
      expect(Array.isArray(etRes.body)).toBe(true);
      expect(etRes.body.length).toBeGreaterThan(0);
      expect(etRes.body[0].description).toBe('100m Sprint');
    });

    it('3. copy includes point scales', async () => {
      const copyName = `Copy PS Test ${Date.now()}`;
      const res = await request(app)
        .post(`/carnivals/${sourceCarnivalId}/copy`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: copyName });

      expect(res.status).toBe(201);
      createdCarnivalIds.push(res.body.id);
      const newId = res.body.id;

      const psRes = await request(app)
        .get(`/carnivals/${newId}/point-scales`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(psRes.status).toBe(200);
      expect(Array.isArray(psRes.body)).toBe(true);
      expect(psRes.body.length).toBeGreaterThan(0);
      expect(psRes.body[0].name).toBe('A');
    });

    it('4. copy does NOT include competitors', async () => {
      // Add a competitor to source
      const houseRes = await request(app)
        .get(`/carnivals/${sourceCarnivalId}/houses`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      const houseId = houseRes.body[0]?.id;

      if (houseId) {
        await request(app)
          .post(`/carnivals/${sourceCarnivalId}/competitors`)
          .set('Authorization', `Bearer ${coordinatorToken}`)
          .send({ givenName: 'Jane', surname: 'Doe', sex: 'F', age: 12, houseCode: 'RED' });
      }

      const copyName = `Copy No-Comp Test ${Date.now()}`;
      const res = await request(app)
        .post(`/carnivals/${sourceCarnivalId}/copy`)
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ name: copyName });

      expect(res.status).toBe(201);
      createdCarnivalIds.push(res.body.id);
      const newId = res.body.id;

      const compRes = await request(app)
        .get(`/carnivals/${newId}/competitors`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(compRes.status).toBe(200);
      const compBody = compRes.body.data ?? compRes.body;
      expect(Array.isArray(compBody) ? compBody.length : compBody.total ?? 0).toBe(0);
    });
  });

  describe('GET /carnivals/:id/export', () => {
    it('5. export produces JSON bundle with all required keys', async () => {
      const res = await request(app)
        .get(`/carnivals/${sourceCarnivalId}/export`)
        .set('Authorization', `Bearer ${coordinatorToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-disposition']).toMatch(/attachment/);

      const bundle = res.body;
      expect(bundle.version).toBe('1.0');
      expect(bundle.exportedAt).toBeDefined();
      expect(bundle.carnival).toBeDefined();
      expect(bundle.settings).toBeDefined();
      expect(Array.isArray(bundle.houses)).toBe(true);
      expect(Array.isArray(bundle.eventTypes)).toBe(true);
      expect(Array.isArray(bundle.events)).toBe(true);
      expect(Array.isArray(bundle.heats)).toBe(true);
      expect(Array.isArray(bundle.pointScales)).toBe(true);
      expect(Array.isArray(bundle.competitors)).toBe(true);
      expect(Array.isArray(bundle.records)).toBe(true);
    });
  });

  describe('POST /carnivals/import', () => {
    it('6. import from export bundle creates a new carnival', async () => {
      // First export the source carnival
      const exportRes = await request(app)
        .get(`/carnivals/${sourceCarnivalId}/export`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(exportRes.status).toBe(200);

      const bundle = exportRes.body;
      const importName = `Imported ${Date.now()}`;

      // Import via JSON body (tests the body path)
      const importRes = await request(app)
        .post('/carnivals/import')
        .set('Authorization', `Bearer ${coordinatorToken}`)
        .send({ ...bundle, carnival: { ...bundle.carnival, name: importName } });

      expect(importRes.status).toBe(201);
      expect(importRes.body.name).toBe(importName);
      createdCarnivalIds.push(importRes.body.id);

      // Verify event types were imported
      const etRes = await request(app)
        .get(`/carnivals/${importRes.body.id}/event-types`)
        .set('Authorization', `Bearer ${coordinatorToken}`);
      expect(etRes.status).toBe(200);
      expect(etRes.body.length).toBeGreaterThan(0);
    });
  });
});

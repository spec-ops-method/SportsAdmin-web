import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';
import prisma from '../../src/prisma/client';

const testEmails: string[] = [];
let token: string;
let carnivalId: number;

beforeAll(async () => {
  const email = `meetmgr-test+${Date.now()}@example.com`;
  testEmails.push(email);
  ({ token } = await createTestUser({ email, role: 'coordinator' }));

  const carnivalRes = await request(app)
    .post('/carnivals')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `MeetMgr Test Carnival ${Date.now()}` });
  carnivalId = carnivalRes.body.id;

  // Add a house and competitor for export tests
  const houseRes = await request(app)
    .post(`/carnivals/${carnivalId}/houses`)
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RED', name: 'Red House' });
  const houseId = houseRes.body.id;

  await request(app)
    .post(`/carnivals/${carnivalId}/competitors`)
    .set('Authorization', `Bearer ${token}`)
    .send({ givenName: 'Alice', surname: 'Smith', sex: 'F', age: 12, houseCode: 'RED' });

  // Add event type with meet_manager_event set
  const etRes = await request(app)
    .post(`/carnivals/${carnivalId}/event-types`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: '100m Sprint', units: 'Seconds', laneCount: 4 });
  const etId = etRes.body.id;

  // Set meetManagerEvent via update
  await prisma.eventType.update({
    where: { id: etId },
    data: { meetManagerEvent: '100M' },
  });

  // Add competitor event age mapping
  await prisma.competitorEventAge.create({
    data: { carnivalId, competitorAge: 12, eventAge: '12', flag: true },
  });

  void houseId;
});

afterAll(async () => {
  await cleanupTestUsers(testEmails);
  await prisma.carnival.deleteMany({ where: { name: { startsWith: 'MeetMgr Test Carnival' } } });
});

describe('Meet Manager routes', () => {
  describe('GET /carnivals/:id/meet-manager/divisions', () => {
    it('returns empty array when no event ages configured', async () => {
      const emptyEmail = `meetmgr-empty+${Date.now()}@example.com`;
      testEmails.push(emptyEmail);
      const { token: t } = await createTestUser({ email: emptyEmail, role: 'coordinator' });
      const cRes = await request(app)
        .post('/carnivals')
        .set('Authorization', `Bearer ${t}`)
        .send({ name: `MeetMgr Empty ${Date.now()}` });
      const cId = cRes.body.id;

      const res = await request(app)
        .get(`/carnivals/${cId}/meet-manager/divisions`)
        .set('Authorization', `Bearer ${t}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('returns division mappings for carnival with event ages', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/meet-manager/divisions`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const division = res.body.find((d: { eventAge: string }) => d.eventAge === '12');
      expect(division).toBeDefined();
      expect(division).toHaveProperty('mdiv');
    });
  });

  describe('PUT /carnivals/:id/meet-manager/divisions', () => {
    it('updates mdiv values for event ages', async () => {
      const res = await request(app)
        .put(`/carnivals/${carnivalId}/meet-manager/divisions`)
        .set('Authorization', `Bearer ${token}`)
        .send([{ eventAge: '12', mdiv: '12' }]);

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(1);

      // Verify the update
      const getRes = await request(app)
        .get(`/carnivals/${carnivalId}/meet-manager/divisions`)
        .set('Authorization', `Bearer ${token}`);
      const division = getRes.body.find((d: { eventAge: string }) => d.eventAge === '12');
      expect(division?.mdiv).toBe('12');
    });
  });

  describe('GET /carnivals/:id/meet-manager/export/entries', () => {
    it('returns text/plain response', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/meet-manager/export/entries`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
    });
  });

  describe('GET /carnivals/:id/meet-manager/export/athletes', () => {
    it('returns text/plain response', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/meet-manager/export/athletes`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
    });
  });

  describe('GET /carnivals/:id/meet-manager/export/re1', () => {
    it('returns correct Content-Disposition header', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/meet-manager/export/re1`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('meet-manager.re1');
    });

    it('includes header line in RE1 export', async () => {
      const res = await request(app)
        .get(`/carnivals/${carnivalId}/meet-manager/export/re1`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const text = res.text;
      // RE1 header format: "Title";"MM/DD/YYYY";"Sports Administrator";"1.0"
      expect(text).toContain('"Sports Administrator"');
      expect(text).toContain('"1.0"');
    });
  });
});

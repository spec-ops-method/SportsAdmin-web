import request from 'supertest';
import app from '../../src/index';
import { createTestUser, cleanupTestUsers } from '../setup/helpers';

describe('Auth routes', () => {
  const testEmail = `auth-test+${Date.now()}@example.com`;

  afterAll(async () => {
    await cleanupTestUsers([testEmail]);
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      await createTestUser({ email: testEmail, password: 'correct-password', role: 'operator' });
    });

    it('returns a token and user on valid credentials', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testEmail, password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.role).toBe('operator');
      expect(res.body.user.passwordHash).toBeUndefined(); // never leak hash
    });

    it('returns 401 on wrong password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testEmail, password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('returns 401 for unknown email', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'password' });

      expect(res.status).toBe(401);
    });

    it('returns 400 on invalid input', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the current user when authenticated', async () => {
      const { token, user } = await createTestUser({ role: 'coordinator' });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.role).toBe('coordinator');

      await cleanupTestUsers([user.email]);
    });

    it('returns 401 when no token provided', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 for an invalid token', async () => {
      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 200 when authenticated', async () => {
      const { token, user } = await createTestUser();
      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      await cleanupTestUsers([user.email]);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('always returns 200 regardless of whether email exists', async () => {
      const res = await request(app)
        .post('/auth/reset-password')
        .send({ email: 'nobody@example.com' });
      expect(res.status).toBe(200);
    });

    it('returns 400 on invalid email', async () => {
      const res = await request(app)
        .post('/auth/reset-password')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });
  });
});

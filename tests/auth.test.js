require('./setup');

const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const emailQueue = require('../queues/email.queue');
const crypto = require('crypto');
// const bcrypt = require('bcrypt');
const bcrypt = require('bcryptjs');

require('./setup');

describe('Auth Integration Tests', () => {
  const testUser = {
    email: 'tester@example.com',
    password: 'Password123!',
  };

  // ---------------------------------------------------
  // 1. POST /auth/register
  // ---------------------------------------------------
  describe('POST /auth/register', () => {
    it('should register a new user, queue verification email, and return 201', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');
      expect(res.body.user).toHaveProperty('email', testUser.email);
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('passwordHash');

      // Verify user saved as unverified
      const dbUser = await User.findOne({ email: testUser.email });
      expect(dbUser).toBeTruthy();
      expect(dbUser.isVerified).toBe(false);

      // Verify email job was queued
      expect(emailQueue.add).toHaveBeenCalledWith(
        'sendVerificationEmail',
        expect.objectContaining({ to: testUser.email })
      );
    });

    it('should return 409 when registering duplicate email', async () => {
      await request(app).post('/auth/register').send(testUser);
      const res = await request(app).post('/auth/register').send(testUser);

      expect(res.status).toBe(409);
    });
  });

  // ---------------------------------------------------
  // 2. GET /auth/verify/:token
  // ---------------------------------------------------
  describe('GET /auth/verify/:token', () => {
    it('should verify the user email with a valid token', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await User.create({
        email: 'unverified@example.com',
        passwordHash: await bcrypt.hash('Password123!', 10),
        isVerified: false,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      const res = await request(app).get(`/auth/verify/${rawToken}`);
      expect(res.status).toBe(302); // Redirect to app login

      const verifiedUser = await User.findOne({ email: 'unverified@example.com' });
      expect(verifiedUser.isVerified).toBe(true);
    });

    it('should return 400 for an invalid or expired token', async () => {
      const res = await request(app).get('/auth/verify/invalidtoken123');
      expect([400, 302]).toContain(res.status); // 400 or redirect to ?verified=false
    });
  });

  // ---------------------------------------------------
  // 3. POST /auth/login
  // ---------------------------------------------------
  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await User.create({
        email: testUser.email,
        passwordHash: await bcrypt.hash(testUser.password, 10),
        isVerified: true,
      });
    });

    it('should login verified user, return accessToken and HttpOnly cookie', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send(testUser);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');

      // Check cookie headers
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes('refreshToken='))).toBe(true);
      expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);
    });

    it('should return 401 on incorrect password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword!' });

      expect(res.status).toBe(401);
    });

    it('should return 403 if user is not verified', async () => {
      await User.updateOne({ email: testUser.email }, { isVerified: false });

      const res = await request(app)
        .post('/auth/login')
        .send(testUser);

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------
  // 4. POST /auth/refresh & POST /auth/logout (Session Flow)
  // ---------------------------------------------------
  describe('Session Lifecycle: Refresh and Logout', () => {
    let agent;

    beforeEach(async () => {
      await User.create({
        email: testUser.email,
        passwordHash: await bcrypt.hash(testUser.password, 10),
        isVerified: true,
      });

      // supertest.agent automatically persists cookies across requests
      agent = request.agent(app);
      await agent.post('/auth/login').send(testUser);
    });

    it('should refresh access token using the session cookie', async () => {
      const res = await agent.post('/auth/refresh');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });

    it('should logout, clear cookie, and reject subsequent refreshes', async () => {
      const logoutRes = await agent.post('/auth/logout');
      expect(logoutRes.status).toBe(200);

      // Attempting to refresh after logout must fail
      const refreshRes = await agent.post('/auth/refresh');
      expect(refreshRes.status).toBe(401);
    });
  });

  // ---------------------------------------------------
  // 5. POST /auth/forgot-password & POST /auth/reset-password
  // ---------------------------------------------------
  describe('Password Reset Flow', () => {
    it('should return generic success message and queue email', async () => {
      await User.create({
        email: 'reset@example.com',
        passwordHash: await bcrypt.hash('OldPassword123!', 10),
        isVerified: true,
      });

      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'reset@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/reset link has been sent/i);
      expect(emailQueue.add).toHaveBeenCalledWith(
        'sendPasswordResetEmail',
        expect.objectContaining({ to: 'reset@example.com' })
      );
    });

    it('should reset password with valid token and allow login with new password', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await User.create({
        email: 'resetme@example.com',
        passwordHash: await bcrypt.hash('OldPassword123!', 10),
        isVerified: true,
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      const resetRes = await request(app)
        .post('/auth/reset-password')
        .send({ token: rawToken, newPassword: 'NewPassword999!' });

      expect(resetRes.status).toBe(200);

      // Try logging in with the old password (should fail)
      const oldLogin = await request(app)
        .post('/auth/login')
        .send({ email: 'resetme@example.com', password: 'OldPassword123!' });
      expect(oldLogin.status).toBe(401);

      // Try logging in with the new password (should succeed)
      const newLogin = await request(app)
        .post('/auth/login')
        .send({ email: 'resetme@example.com', password: 'NewPassword999!' });
      expect(newLogin.status).toBe(200);
    });
  });

  // ---------------------------------------------------
  // 6. GET /auth/google & Callback
  // ---------------------------------------------------
  describe('Google OAuth Flow', () => {
    it('GET /auth/google should set state cookie and redirect', async () => {
      const res = await request(app).get('/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');

      const cookies = res.headers['set-cookie'];
      expect(cookies.some((c) => c.includes('oauth_state='))).toBe(true);
    });

    it('GET /auth/google/callback should create Google user and issue cookies', async () => {
      const agent = request.agent(app);
      await agent.get('/auth/google'); // Populates oauth_state cookie

      // Extract the state cookie to simulate the roundtrip
      const res = await agent
        .get('/auth/google/callback')
        .query({ code: 'mock-auth-code', state: 'mock-state' });

      // Accepts either redirect or direct 200 payload
      expect([200, 302]).toContain(res.status);

      const createdUser = await User.findOne({ email: 'googleuser@example.com' });
      expect(createdUser).toBeTruthy();
      expect(createdUser.googleId).toBe('google-test-id-123');
      expect(createdUser.isVerified).toBe(true);
    });
  });
});
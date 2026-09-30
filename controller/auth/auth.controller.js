const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const redisClient = require('../../config/redis');
const { addVerificationEmailJob, addPasswordResetEmailJob } = require('../../queues/email.queue');
const oauth2Client = require('../../config/oauth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports.register = async (req, res) => {

  const { email, password } = req.body;
  try {

    const normalizedEmail = email.trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password is required and must be at least 8 characters long' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }


    const hashedPassword = await bcrypt.hash(password, 12);

    const rawVerificationToken = crypto.randomBytes(64).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

    const emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = new User({
      email: normalizedEmail,
      passwordHash: hashedPassword,
      isVerified: false,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationExpiresAt,
      authProvider: 'local'
    });

    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const verificationLink = `${appUrl}/auth/verify/${rawVerificationToken}`;

    await addVerificationEmailJob(user.email, verificationLink);


    return res.status(201).json({
      message: 'Registration successful. Please verify your email.',
      user: {
        id: user._id,
        email: user.email,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

};

module.exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Block unverified local users
    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
        algorithm: 'HS256'
      }
    );

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = await crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    await redisClient.set(`refresh:${tokenHash}`, user._id.toString(), 'EX', 604800);

    res.cookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt
      },
    });

  } catch (error) {
    console.error('Error logging in user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

};

// module.exports.refresh = async (req, res) => {
//   try {

//     const refreshToken = req.cookies.refreshToken;

//     if (!refreshToken) {
//       return res.status(401).json({ error: 'Refresh token missing' });
//     }

//     const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

//     const userId = await redisClient.get(`refresh:${tokenHash}`);
//     if (!userId) {
//       return res.status(401).json({ error: 'Invalid or expired refresh token' });
//     }

//     const newAccessToken = jwt.sign(
//       { userId },
//       process.env.JWT_ACCESS_SECRET,
//       { expiresIn: '15m', algorithm: 'HS256' }
//     );

//     return res.status(200).json({ accessToken: newAccessToken });
//   } catch (error) {
//     console.error('Error refreshing token:', error);
//     return res.status(500).json({ error: 'Internal server error' });
//   }
// }


module.exports.refresh = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
      return res.status(401).json({ error: 'Refresh token missing' });
    }

    // 1. Hash incoming token and check Redis
    const oldTokenHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');
    const userId = await redisClient.get(`refresh:${oldTokenHash}`);

    if (!userId) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // 2. Rotate: Delete old token from Redis
    await redisClient.del(`refresh:${oldTokenHash}`);

    // 3. Generate NEW refresh token & hash
    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');

    // 4. Save NEW refresh token to Redis (7-day TTL)
    const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

    await redisClient.set(
      `refresh:${newTokenHash}`,
      userId.toString(),
      'EX',
      REFRESH_TTL_SECONDS
    );

    // 5. Overwrite the cookie with the new refresh token
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    // 6. Generate NEW access token (15m expiry)
    const accessToken = jwt.sign(
      { userId },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    return res.status(200).json({ accessToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports.logout = async (req, res) => {
  try {

    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await redisClient.del(`refresh:${tokenHash}`);
    }

    res.clearCookie('refreshToken');

    return res.status(200).json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Error logging out:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

}

module.exports.verifyEmail = async (req, res) => {
  try {


    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Verification token missing' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() },
    });


    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return res.redirect(302, `${appUrl}/login?verified=true`);
  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

}


module.exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email.trim().toLowerCase())) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();


    const user = await User.findOne({ email: normalizedEmail });


    if (user) {

      const rawResetToken = crypto.randomBytes(32).toString('hex');


      const resetTokenHash = crypto
        .createHash('sha256')
        .update(rawResetToken)
        .digest('hex');


      user.passwordResetTokenHash = resetTokenHash;
      user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();


      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const resetLink = `${appUrl}/auth/reset-password/${rawResetToken}`;

      await addPasswordResetEmailJob(user.email, resetLink);
    }


    return res.status(200).json({
      message: 'If this email exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Error handling forgot password:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports.resetPassword = async (req, res) => {
  try {

    const { token, newPassword } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Password reset token required' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password is required and must be at least 8 characters long' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    })

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.passwordHash = hashedPassword;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();


    const currentRefreshToken = req.cookies?.refreshToken;
    if (currentRefreshToken) {
      const refreshHash = crypto.createHash('sha256').update(currentRefreshToken).digest('hex');
      await redisClient.del(`refresh:${refreshHash}`);
      res.clearCookie('refreshToken');
    }

    return res.status(200).json({ message: 'Password reset successfully' });

  } catch (error) {
    console.error('Error verifying email:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports.googleAuth = (req, res) => {
  // Generate random state to mitigate CSRF attacks
  const state = process.env.NODE_ENV === 'test' ? 'mock-state' : crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Required for cross-site OAuth redirects
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'consent',
    state,
  });

  return res.redirect(authUrl);
};

module.exports.googleCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const storedState = req.cookies?.oauth_state;

    // 1. Verify CSRF State
    if (!state || !storedState || state !== storedState) {
      return res.status(403).json({ error: 'Invalid OAuth state. Possible CSRF attack.' });
    }
    res.clearCookie('oauth_state');

    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    // 2. Exchange code for Google tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // 3. Verify Google ID token and get user profile
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email } = payload;
    const normalizedEmail = email.trim().toLowerCase();

    // 4. Resolve User in MongoDB (The 4 Acceptance Cases)
    let user = await User.findOne({ googleId });

    if (!user) {
      user = await User.findOne({ email: normalizedEmail });

      if (user) {
        // Case 3 & 4: Existing local user -> Link googleId and auto-verify
        user.googleId = googleId;
        user.isVerified = true;
        await user.save();
      } else {
        // Case 1: New user -> Create OAuth user
        user = new User({
          email: normalizedEmail,
          googleId,
          isVerified: true,
          authProvider: 'google',
          passwordHash: null,
        });
        await user.save();
      }
    }

    // 5. Issue Standard Tokens (Same as local login)
    const accessToken = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m', algorithm: 'HS256' }
    );

    // Generate opaque refresh token + SHA-256 hash
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    // Store in local Redis with 7-day TTL (using ioredis syntax)
    const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;
    await redisClient.set(`refresh:${tokenHash}`, user._id.toString(), 'EX', REFRESH_TTL_SECONDS);

    // Set HTTP-only Cookie
    res.cookie('refreshToken', rawRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TTL_SECONDS * 1000,
      path: '/',
    });

    // 6. Redirect to frontend app or return JSON (if developing without frontend)
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    // return res.redirect(`${appUrl}/dashboard?token=${accessToken}`);
      return res.status(200).json({
      message: 'Google login successful',
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        isVerified: user.isVerified,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};
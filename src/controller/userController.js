const { createUser, authenticateUser, findUserByEmail } = require('../helper/user');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { jwt: jwtConfig } = require('../config/env');

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
// Assuming standard ports, but ideally should be env vars
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:6969';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

function signToken(user) {
  const payload = { sub: user.id, email: user.email };
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
}

async function registerUser(req, res, next) {
  try {
    const { email, password, fullName } = req.body || {};
    const user = await createUser({ email, password, fullName });
    const token = signToken(user);
    const safeUser = { ...user };
    delete safeUser.password_hash;
    res.status(201).json({ token, user: safeUser });
  } catch (error) {
    next(error);
  }
}

async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body || {};
    const user = await authenticateUser({ email, password });
    const token = signToken(user);
    const safeUser = { ...user };
    delete safeUser.password_hash;
    res.json({ token, user: safeUser });
  } catch (error) {
    next(error);
  }
}

async function getMe(req, res, next) {
  try {
    res.json({ user: req.user });
  } catch (error) {
    next(error);
  }
}

async function githubLogin(req, res) {
  const state = crypto.randomBytes(16).toString('hex');
  const scope = 'user:email';
  const redirectUri = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${BACKEND_URL}/api/users/auth/github/callback&scope=${scope}&state=${state}`;
  res.redirect(redirectUri);
}

async function githubCallback(req, res, next) {
  const { code } = req.query;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/auth?error=github_auth_failed`);
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code
      })
    });

    const tokenData = await tokenResponse.json();
    if (tokenData.error) throw new Error(tokenData.error_description || 'Token Exchange Failed');

    const accessToken = tokenData.access_token;

    // Get user data
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const githubUser = await userResponse.json();

    // Get user email
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const emails = await emailResponse.json();
    const primaryEmail = Array.isArray(emails)
      ? (emails.find(e => e.primary && e.verified)?.email || emails[0]?.email)
      : githubUser.email;

    if (!primaryEmail) throw new Error('No public email found on GitHub account');

    let user = await findUserByEmail(primaryEmail);

    if (!user) {
      // Create user with random password
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = await createUser({
        email: primaryEmail,
        password: randomPassword,
        fullName: githubUser.name || githubUser.login
      });
    }

    const token = signToken(user);
    const safeUser = { ...user };
    delete safeUser.password_hash;

    // Redirect to frontend dashboard (using HashRouter)
    // passing token in query param
    res.redirect(`${FRONTEND_URL}/#/dashboard?token=${token}&user=${encodeURIComponent(JSON.stringify(safeUser))}`);

  } catch (error) {
    console.error('GitHub Auth Error:', error);
    res.redirect(`${FRONTEND_URL}/auth?error=github_auth_error`);
  }
}

module.exports = {
  registerUser,
  loginUser,
  getMe,
  githubLogin,
  githubCallback
};
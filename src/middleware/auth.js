const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');
const { getUserById } = require('../helper/user');

async function auth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      const err = new Error('Unauthorized');
      err.statusCode = 401;
      err.code = 'AUTH_REQUIRED';
      throw err;
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtConfig.secret);
    } catch (e) {
      const err = new Error('Invalid or expired token');
      err.statusCode = 401;
      err.code = 'INVALID_TOKEN';
      throw err;
    }

    const user = await getUserById(payload.sub);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 401;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const safeUser = { ...user };
    delete safeUser.password_hash;

    req.user = safeUser;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = auth;

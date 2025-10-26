const { createUser, authenticateUser } = require('../helper/user');
const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');

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

module.exports = {
  registerUser,
  loginUser,
  getMe,
};
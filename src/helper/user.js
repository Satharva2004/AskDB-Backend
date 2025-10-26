const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

const USER_FIELDS = ['id', 'email', 'password_hash', 'full_name', 'created_at', 'updated_at'];

function validateEmail(email) {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    const error = new Error('Invalid email address');
    error.code = 'INVALID_EMAIL';
    throw error;
  }

  return email.trim().toLowerCase();
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    const error = new Error('Password must be at least 8 characters long');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  return password;
}

function validateFullName(fullName) {
  if (fullName == null) {
    return null;
  }

  if (typeof fullName !== 'string' || fullName.trim().length === 0) {
    const error = new Error('Full name must be a non-empty string when provided');
    error.code = 'INVALID_FULL_NAME';
    throw error;
  }

  return fullName.trim();
}

function normalizeTimestamp(v) {
  if (v == null) return null;
  if (v === 0 || v === '0') return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '0000-00-00 00:00:00' || s.startsWith('0000-00-00')) return null;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return v;
  }
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v > 0 ? v * 1000 : v;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }
  return v;
}

function mapDbUser(row) {
  if (!row) {
    return null;
  }

  const user = USER_FIELDS.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      acc[field] = row[field];
    }
    return acc;
  }, {});

  user.created_at = normalizeTimestamp(user.created_at);
  user.updated_at = normalizeTimestamp(user.updated_at);

  return user;
}

async function createUser({ email, password, fullName }) {
  const normalizedEmail = validateEmail(email);
  const validPassword = validatePassword(password);
  const normalizedFullName = validateFullName(fullName);

  try {
    const existingUsers = await query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);

    if (existingUsers.length > 0) {
      const error = new Error('An account already exists for this email');
      error.code = 'USER_ALREADY_EXISTS';
      throw error;
    }

    const passwordHash = await bcrypt.hash(validPassword, 12);

    const result = await query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES (?, ?, ?)`,
      [normalizedEmail, passwordHash, normalizedFullName]
    );

    const [createdUser] = await query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    
    return mapDbUser(createdUser);
  } catch (error) {
    if (!error.code) {
      error.code = 'USER_CREATION_FAILED';
    }
    throw error;
  }
}

async function getUserById(id) {
  try {
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return null;
    }
    return mapDbUser(rows[0]);
  } catch (error) {
    if (!error.code) {
      error.code = 'USER_FETCH_FAILED';
    }
    throw error;
  }
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = validateEmail(email);
  const validPassword = validatePassword(password);

  try {
    const rows = await query('SELECT * FROM users WHERE email = ?', [normalizedEmail]);

    if (rows.length === 0) {
      const error = new Error('Invalid email or password');
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    const user = rows[0];

    const passwordMatches = await bcrypt.compare(validPassword, user.password_hash);

    if (!passwordMatches) {
      const error = new Error('Invalid email or password');
      error.code = 'INVALID_CREDENTIALS';
      throw error;
    }

    return mapDbUser(user);
  } catch (error) {
    if (!error.code) {
      error.code = 'USER_AUTHENTICATION_FAILED';
    }

    throw error;
  }
}

module.exports = {
  createUser,
  authenticateUser,
  getUserById,
};
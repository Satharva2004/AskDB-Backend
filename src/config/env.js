const path = require('path');

let dotenvLoaded = false;
try {
  // Hide noisy dotenv banner
  process.env.DOTENV_HIDE_BANNER = 'true';
  // Load .env from project root
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  dotenvLoaded = true;
} catch (_) {
  // dotenv may not be installed yet; continue with process.env
}

const config = {
  app: {
    port: Number(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  db: {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'test',
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    queueLimit: Number(process.env.MYSQL_QUEUE_LIMIT || 0),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  meta: {
    dotenvLoaded,
  },
};

module.exports = config;

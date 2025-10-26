const mysql = require('mysql2/promise');
const { db: dbConfig } = require('../config/env');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      port: dbConfig.port,
      waitForConnections: true,
      connectionLimit: dbConfig.connectionLimit,
      queueLimit: dbConfig.queueLimit,
    });
  }

  return pool;
}

async function query(sql, params = []) {
  const poolInstance = getPool();

  try {
    const [result] = await poolInstance.execute(sql, params);
    return result;
  } catch (error) {
    const enhancedError = new Error('Database query failed');
    enhancedError.code = 'DATABASE_QUERY_FAILED';
    enhancedError.cause = error;
    throw enhancedError;
  }
}

module.exports = {
  getPool,
  query,
};
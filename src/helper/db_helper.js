const mysql = require('mysql2/promise');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'askdb',
      port: Number(process.env.MYSQL_PORT || 3306),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
      queueLimit: Number(process.env.MYSQL_QUEUE_LIMIT || 0),
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
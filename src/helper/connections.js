const { query } = require('../config/db');
const mysql = require('mysql2/promise');
const { Pool } = require('pg');

function validateString(name, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    const err = new Error(`${name} is required`);
    err.code = `INVALID_${name.toUpperCase()}`;
    throw err;
  }
  return value.trim();
}

function validatePort(port) {
  const n = Number(port);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    const err = new Error('port must be a valid integer between 1 and 65535');
    err.code = 'INVALID_PORT';
    throw err;
  }
  return n;
}

async function testConnectionAndFetchSchema({ host, port, user, password, database, db_type }) {
  if (db_type === 'mysql') {
    let conn;
    try {
      conn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
        connectTimeout: 30000, // 30 seconds
        timeout: 60000 // 60 seconds for queries
      });
      const [tables] = await conn.query(
        `SELECT TABLE_NAME AS table_name
         FROM information_schema.tables
         WHERE table_schema = ?
         ORDER BY TABLE_NAME`,
        [database]
      );
      const schema = {};
      for (const row of tables) {
        const table = row.table_name;
        const [cols] = await conn.query(
          `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
           FROM information_schema.columns
           WHERE table_schema = ? AND table_name = ?
           ORDER BY ORDINAL_POSITION`,
          [database, table]
        );
        schema[table] = cols;
      }
      return schema;
    } finally {
      if (conn) await conn.end();
    }
  } else if (db_type === 'postgresql') {
    const pool = new Pool({
      host,
      port,
      user,
      password,
      database,
      connectionTimeoutMillis: 30000, // 30 seconds
      query_timeout: 60000, // 60 seconds for queries
      statement_timeout: 60000, // 60 seconds statement timeout
      ssl: {
        rejectUnauthorized: false // Accept self-signed certificates (AWS RDS)
      }
    });
    try {
      const tablesResult = await pool.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`
      );
      const schema = {};
      for (const row of tablesResult.rows) {
        const table = row.table_name;
        const colsResult = await pool.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`,
          [table]
        );
        schema[table] = colsResult.rows;
      }
      return schema;
    } finally {
      await pool.end();
    }
  }
}

async function createConnection({ db_type, host, port, user, password, database, user_id = null }) {
  const normalized = {
    db_type: validateString('db_type', db_type).toLowerCase(),
    host: validateString('host', host),
    port: validatePort(port),
    user: validateString('user', user),
    password: validateString('password', password),
    database: validateString('database', database),
    user_id: user_id == null ? null : Number(user_id),
  };

  const supportedTypes = ['mysql', 'postgresql', 'postgres'];
  if (!supportedTypes.includes(normalized.db_type)) {
    const e = new Error('Only mysql and postgresql db_types are supported');
    e.code = 'UNSUPPORTED_DB_TYPE';
    throw e;
  }

  // Normalize postgres to postgresql
  if (normalized.db_type === 'postgres') {
    normalized.db_type = 'postgresql';
  }

  // Warn about common port mismatches
  if (normalized.db_type === 'mysql' && normalized.port === 5432) {
    const e = new Error('Port 5432 is typically used for PostgreSQL, not MySQL. Did you mean to use db_type: "postgresql"? MySQL typically uses port 3306.');
    e.code = 'POSSIBLE_WRONG_DB_TYPE';
    throw e;
  }

  if (normalized.db_type === 'postgresql' && normalized.port === 3306) {
    const e = new Error('Port 3306 is typically used for MySQL, not PostgreSQL. Did you mean to use db_type: "mysql"? PostgreSQL typically uses port 5432.');
    e.code = 'POSSIBLE_WRONG_DB_TYPE';
    throw e;
  }

  try {
    const schema = await testConnectionAndFetchSchema(normalized);

    const result = await query(
      `INSERT INTO connections (\`user_id\`, \`db_type\`, \`host\`, \`port\`, \`user\`, \`password\`, \`database\`)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [normalized.user_id, normalized.db_type, normalized.host, normalized.port, normalized.user, normalized.password, normalized.database]
    );

    const [created] = await query('SELECT * FROM connections WHERE id = ?', [result.insertId]);
    if (!created) {
      const e = new Error('Failed to read back created connection');
      e.code = 'CONNECTION_CREATE_READBACK_FAILED';
      throw e;
    }

    // Ensure and persist schema snapshot
    await ensureSchemaSnapshotTables();
    await persistSchemaSnapshot(result.insertId, schema);

    const safe = sanitizeConnection(created);
    safe.schema = schema;
    return safe;
  } catch (error) {
    if (!error.code) error.code = 'CONNECTION_CREATE_FAILED';
    throw error;
  }
}

function sanitizeConnection(row) {
  const safe = { ...row };
  if ('password' in safe) {
    safe.password = '********';
  }
  return safe;
}

async function listConnectionsForUser(userId) {
  const normalizedId = Number(userId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    const err = new Error('Valid user id is required');
    err.code = 'INVALID_USER_ID';
    err.statusCode = 400;
    throw err;
  }

  const rows = await query('SELECT * FROM connections WHERE user_id = ? ORDER BY updated_at DESC, id DESC', [normalizedId]);
  return rows.map((row) => sanitizeConnection(row));
}

async function ensureSchemaSnapshotTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS \`connection_schema_tables\` (
       \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
       \`connection_id\` BIGINT UNSIGNED NOT NULL,
       \`table_name\` VARCHAR(255) NOT NULL,
       \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX \`idx_tbl_conn\` (\`connection_id\`),
       INDEX \`idx_tbl_name\` (\`table_name\`)
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS \`connection_schema_columns\` (
       \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
       \`table_id\` BIGINT UNSIGNED NOT NULL,
       \`column_name\` VARCHAR(255) NOT NULL,
       \`data_type\` VARCHAR(64) NOT NULL,
       \`is_nullable\` VARCHAR(3) NOT NULL,
       \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX \`idx_col_tbl\` (\`table_id\`),
       INDEX \`idx_col_name\` (\`column_name\`)
     )`
  );
}

async function persistSchemaSnapshot(connectionId, schema) {
  // Ensure parent table exists in DB migrations before calling this
  // Tables: connection_schema_tables (id, connection_id, table_name),
  //         connection_schema_columns (id, table_id, column_name, data_type, is_nullable)
  for (const [tableName, columns] of Object.entries(schema)) {
    const insertTable = await query(
      `INSERT INTO \`connection_schema_tables\` (\`connection_id\`, \`table_name\`) VALUES (?, ?)`,
      [connectionId, tableName]
    );
    const tableId = insertTable.insertId;
    for (const col of columns) {
      await query(
        `INSERT INTO \`connection_schema_columns\` (\`table_id\`, \`column_name\`, \`data_type\`, \`is_nullable\`) VALUES (?, ?, ?, ?)`,
        [tableId, col.column_name, col.data_type, col.is_nullable]
      );
    }
  }
}

module.exports = { createConnection };
module.exports.listConnectionsForUser = listConnectionsForUser;

// --- New helpers for executing SQL on a saved connection ---
async function getConnectionDetails(connectionId) {
  const rows = await query('SELECT * FROM connections WHERE id = ?', [connectionId]);
  const conn = rows && rows[0];
  if (!conn) {
    const e = new Error('Connection not found');
    e.code = 'CONNECTION_NOT_FOUND';
    e.statusCode = 404;
    throw e;
  }
  return conn;
}

async function getSchemaSnapshot(connectionId) {
  const tables = await query(
    'SELECT id, table_name FROM connection_schema_tables WHERE connection_id = ? ORDER BY table_name',
    [connectionId]
  );
  const schema = {};
  for (const t of tables) {
    const cols = await query(
      'SELECT column_name, data_type, is_nullable FROM connection_schema_columns WHERE table_id = ? ORDER BY id',
      [t.id]
    );
    schema[t.table_name] = cols;
  }
  return schema;
}

function assertSelectOnly(sql) {
  if (typeof sql !== 'string') {
    const e = new Error('SQL must be a string');
    e.code = 'INVALID_SQL_TYPE';
    throw e;
  }
  const trimmed = sql.trim();
  const isSelect = /^select\b/i.test(trimmed);
  const forbidden = /(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i.test(trimmed);
  if (!isSelect || forbidden) {
    const e = new Error('Only SELECT queries are allowed');
    e.code = 'SQL_NOT_ALLOWED';
    e.statusCode = 400;
    throw e;
  }
}

async function executeSqlOnConnection(connectionId, sql) {
  assertSelectOnly(sql);
  const connInfo = await getConnectionDetails(connectionId);
  const dbType = (connInfo.db_type || '').toLowerCase();

  if (dbType === 'mysql') {
    let conn;
    try {
      conn = await mysql.createConnection({
        host: connInfo.host,
        port: Number(connInfo.port),
        user: connInfo.user,
        password: connInfo.password,
        database: connInfo.database,
        connectTimeout: 30000, // 30 seconds
        timeout: 60000 // 60 seconds for queries
      });
      const [rows] = await conn.query(sql);
      return rows;
    } finally {
      if (conn) await conn.end();
    }
  } else if (dbType === 'postgresql') {
    const pool = new Pool({
      host: connInfo.host,
      port: Number(connInfo.port),
      user: connInfo.user,
      password: connInfo.password,
      database: connInfo.database,
      connectionTimeoutMillis: 30000, // 30 seconds
      query_timeout: 60000, // 60 seconds for queries
      statement_timeout: 60000, // 60 seconds statement timeout
      ssl: {
        rejectUnauthorized: false // Accept self-signed certificates (AWS RDS)
      }
    });
    try {
      const result = await pool.query(sql);
      return result.rows;
    } finally {
      await pool.end();
    }
  } else {
    const e = new Error('Only mysql and postgresql connections are supported');
    e.code = 'UNSUPPORTED_DB_TYPE';
    throw e;
  }
}

module.exports.getConnectionDetails = getConnectionDetails;
module.exports.executeSqlOnConnection = executeSqlOnConnection;
module.exports.getSchemaSnapshot = getSchemaSnapshot;

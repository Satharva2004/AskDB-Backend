const { query } = require('../config/db');
const mysql = require('mysql2/promise');

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

async function testConnectionAndFetchSchema({ host, port, user, password, database }) {
  let conn;
  try {
    conn = await mysql.createConnection({ host, port, user, password, database });
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

  if (normalized.db_type !== 'mysql') {
    const e = new Error('Only mysql db_type is supported for now');
    e.code = 'UNSUPPORTED_DB_TYPE';
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

    const safe = { ...created };
    if ('password' in safe) safe.password = '********';
    safe.schema = schema;
    return safe;
  } catch (error) {
    if (!error.code) error.code = 'CONNECTION_CREATE_FAILED';
    throw error;
  }
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

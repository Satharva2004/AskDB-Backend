const { query } = require('../src/config/db');

async function createTable() {
    try {
        console.log('Creating conversations table...');
        await query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        connection_id BIGINT UNSIGNED,
        role ENUM('user', 'assistant') NOT NULL,
        content TEXT,
        sql_query TEXT,
        visual_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_conn (user_id, connection_id),
        INDEX idx_created (created_at)
      )
    `);
        console.log('conversations table created successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Error creating table:', error);
        process.exit(1);
    }
}

createTable();

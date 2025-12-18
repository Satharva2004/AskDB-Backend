const { query } = require('../src/config/db');

async function migrateConversations() {
    try {
        console.log('Creating new conversation schema...');

        // Check if old conversations table exists
        const tableCheck = await query(`
            SELECT COUNT(*) as count 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'conversations'
        `);

        const oldTableExists = tableCheck[0].count > 0;

        if (oldTableExists) {
            console.log('Found existing conversations table, will migrate data...');
        } else {
            console.log('No existing conversations table found, creating fresh schema...');
        }

        // 1. Create new conversations table
        await query(`
            CREATE TABLE IF NOT EXISTS conversations (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT UNSIGNED NOT NULL,
                connection_id BIGINT UNSIGNED NOT NULL,
                title VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_conn (user_id, connection_id),
                INDEX idx_updated (updated_at DESC)
            )
        `);
        console.log('✓ conversations table created');

        // 2. Create messages table
        await query(`
            CREATE TABLE IF NOT EXISTS messages (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                conversation_id BIGINT UNSIGNED NOT NULL,
                role ENUM('user', 'assistant') NOT NULL,
                content TEXT,
                sql_query TEXT,
                visual_type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_conversation (conversation_id),
                INDEX idx_created (created_at),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        `);
        console.log('✓ messages table created');

        // 3. Migrate data from old conversations table (if it exists)
        if (oldTableExists) {
            console.log('Migrating existing data...');

            // Rename old table first
            await query('RENAME TABLE conversations TO conversations_old');

            // Recreate conversations table
            await query(`
                CREATE TABLE conversations (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    user_id BIGINT UNSIGNED NOT NULL,
                    connection_id BIGINT UNSIGNED NOT NULL,
                    title VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_conn (user_id, connection_id),
                    INDEX idx_updated (updated_at DESC)
                )
            `);

            // Get all unique user+connection combinations from old table
            const oldConversations = await query(`
                SELECT DISTINCT user_id, connection_id 
                FROM conversations_old 
                WHERE user_id IS NOT NULL AND connection_id IS NOT NULL
            `);

            for (const conv of oldConversations) {
                // Get first user message for title
                const firstMsg = await query(`
                    SELECT content 
                    FROM conversations_old 
                    WHERE user_id = ? AND connection_id = ? AND role = 'user'
                    ORDER BY created_at ASC
                    LIMIT 1
                `, [conv.user_id, conv.connection_id]);

                const title = firstMsg[0]?.content?.substring(0, 100) || 'Untitled Conversation';

                // Create new conversation
                const result = await query(`
                    INSERT INTO conversations (user_id, connection_id, title, created_at)
                    VALUES (?, ?, ?, NOW())
                `, [conv.user_id, conv.connection_id, title]);

                const conversationId = result.insertId;

                // Migrate all messages for this user+connection
                const oldMessages = await query(`
                    SELECT role, content, sql_query, visual_type, created_at
                    FROM conversations_old
                    WHERE user_id = ? AND connection_id = ?
                    ORDER BY created_at ASC
                `, [conv.user_id, conv.connection_id]);

                for (const msg of oldMessages) {
                    await query(`
                        INSERT INTO messages (conversation_id, role, content, sql_query, visual_type, created_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `, [conversationId, msg.role, msg.content, msg.sql_query, msg.visual_type, msg.created_at]);
                }

                console.log(`✓ Migrated conversation for user ${conv.user_id}, connection ${conv.connection_id}`);
            }

            console.log('\n✅ Migration completed successfully!');
            console.log('Note: Old table is preserved as "conversations_old". You can drop it after verification.');
        } else {
            console.log('\n✅ Fresh schema created successfully!');
            console.log('You can now start using the conversation system.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrateConversations();

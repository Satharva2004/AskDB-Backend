const { generateQuery, analyzeData } = require('../helper/ai');
const { executeSqlOnConnection, getSchemaSnapshot, getConnectionDetails } = require('../helper/connections');
const { query: dbQuery } = require('../config/db');

async function askDbController(req, res, next) {
  try {
    const { connections_id, connection_id: connIdAlt, query: queryText, question: questionAlt, provider, model, conversation_id } = req.body || {};
    const connection_id = connections_id ?? connIdAlt;
    const question = (typeof queryText === 'string' ? queryText : questionAlt) || '';
    const userId = req.user ? req.user.id : null;

    if (!connection_id) {
      const e = new Error('connection_id is required');
      e.code = 'MISSING_CONNECTION_ID';
      e.statusCode = 400;
      throw e;
    }
    if (typeof question !== 'string' || !question.trim()) {
      const e = new Error('question is required');
      e.code = 'MISSING_QUESTION';
      e.statusCode = 400;
      throw e;
    }

    // Get or create conversation
    let conversationId = conversation_id;
    if (!conversationId && userId) {
      // Create new conversation
      const title = question.substring(0, 100);
      const result = await dbQuery(
        `INSERT INTO conversations (user_id, connection_id, title) VALUES (?, ?, ?)`,
        [userId, connection_id, title]
      );
      conversationId = result.insertId;
    }

    // Optional: include schema snapshot to improve accuracy
    let schemaText = '';
    try {
      const schema = await getSchemaSnapshot(connection_id);
      schemaText = Object.keys(schema).length ? `\nSchema JSON: ${JSON.stringify(schema)}` : '';
    } catch (_) { }

    // Also include active database name and type to guide SQL generation
    let dbName = '';
    let dbType = 'mysql';
    try {
      const conn = await getConnectionDetails(connection_id);
      dbName = conn && conn.database ? String(conn.database) : '';
      dbType = conn && conn.db_type ? String(conn.db_type).toLowerCase() : 'mysql';
    } catch (_) { }

    // Fetch conversation history
    let history = [];
    if (conversationId) {
      const historyRows = await dbQuery(
        `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 10`,
        [conversationId]
      );
      history = historyRows.reverse().map(r => ({ role: r.role, content: r.content }));
    }

    // Save user message
    if (conversationId) {
      await dbQuery(
        `INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)`,
        [conversationId, question]
      );
    }

    // Generate SQL based on database type
    const sqlDialect = dbType === 'postgresql' ? 'PostgreSQL' : 'MySQL';
    const paramPlaceholder = dbType === 'postgresql' ? '$1, $2, etc.' : '?';
    const schemaFilter = dbType === 'postgresql'
      ? `table_schema = 'public'`
      : `table_schema='${dbName}'`;

    const rawSql = await generateQuery(
      `Rules:
1) Output exactly ONE ${sqlDialect} SELECT statement.
2) Never use SHOW, DESCRIBE, EXPLAIN, or any non-SELECT statements.
3) For listing tables/columns, query information_schema.tables and information_schema.columns and filter ${schemaFilter}.
4) Do not modify data and do not include comments or markdown.
5) Database type: ${sqlDialect}
6) Use ${sqlDialect}-specific syntax and functions.
${dbType === 'postgresql' ? '7) Use PostgreSQL-specific features like LIMIT, OFFSET, and proper casting (::type).' : '7) Use MySQL-specific features like LIMIT with offset syntax.'}

User question: ${question}
${schemaText}`
      , { provider, model, history });

    // Sanitize LLM output
    const sanitize = (s) => {
      let t = String(s || '').trim();
      t = t.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      t = t.replace(/`/g, '');
      const m = t.match(/select[\s\S]*?(;|$)/i);
      return m ? m[0].replace(/;\s*$/, '').trim() : t;
    };
    let sql = sanitize(rawSql);

    // Execute SQL safely, with auto-fix loop
    let rows;
    let attempts = 0;
    while (attempts < 2) {
      try {
        rows = await executeSqlOnConnection(connection_id, sql);
        break; // Success
      } catch (err) {
        attempts++;
        if (attempts >= 2) throw err; // Give up after 2 tries (initial + 1 retry)

        console.log(`SQL Error (attempt ${attempts}):`, err.message);
        // Feed error back to LLM for correction
        const fixedRawSql = await generateQuery(
          `Previous query: ${sql}
Error: ${err.message}
Code: ${err.code || 'UNKNOWN'}
Fix the SQL query based on the error above. Output ONLY the fixed SQL.`,
          { provider, model }
        );
        sql = sanitize(fixedRawSql);
      }
    }

    // Analyze results for summary and visualization
    const analysis = await analyzeData(question, rows, { provider, model });

    res.json({
      sql,
      visual: analysis.visual || {},
      data: analysis.data || rows,
      summary: analysis.summary || { text: '' },
      conversation_id: conversationId
    });

    // Save assistant response
    if (conversationId) {
      await dbQuery(
        `INSERT INTO messages (conversation_id, role, content, sql_query, visual_type) VALUES (?, 'assistant', ?, ?, ?)`,
        [conversationId, analysis.summary?.text || '', sql, analysis.visual?.type || 'table']
      );

      // Update conversation timestamp
      await dbQuery(
        `UPDATE conversations SET updated_at = NOW() WHERE id = ?`,
        [conversationId]
      );
    }
  } catch (error) {
    if (error.code === 'ER_PARSE_ERROR' || error.sqlMessage) {
      return res.json({
        message: error.sqlMessage || error.message,
        code: error.code || 'SQL_ERROR',
        error: true
      });
    }
    next(error);
  }
}

async function getConversationsController(req, res, next) {
  try {
    const { connection_id } = req.query;
    const userId = req.user.id;

    if (!connection_id) {
      return res.status(400).json({ error: 'connection_id is required' });
    }

    const conversations = await dbQuery(
      `SELECT id, title, created_at, updated_at 
       FROM conversations 
       WHERE user_id = ? AND connection_id = ? 
       ORDER BY updated_at DESC 
       LIMIT 50`,
      [userId, connection_id]
    );

    res.json(conversations);
  } catch (error) {
    next(error);
  }
}

async function getMessagesController(req, res, next) {
  try {
    const { conversation_id } = req.query;
    const userId = req.user.id;

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }

    // Verify user owns this conversation
    const conv = await dbQuery(
      `SELECT id FROM conversations WHERE id = ? AND user_id = ?`,
      [conversation_id, userId]
    );

    if (!conv || conv.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await dbQuery(
      `SELECT id, role, content, sql_query, visual_type, created_at 
       FROM messages 
       WHERE conversation_id = ? 
       ORDER BY created_at ASC`,
      [conversation_id]
    );

    res.json(messages);
  } catch (error) {
    next(error);
  }
}

async function deleteConversationController(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const conv = await dbQuery(
      `SELECT id FROM conversations WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (!conv || conv.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete conversation (messages will cascade delete)
    await dbQuery(`DELETE FROM conversations WHERE id = ?`, [id]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  askDbController,
  getConversationsController,
  getMessagesController,
  deleteConversationController
};

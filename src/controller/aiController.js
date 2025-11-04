const { generateQuery, summarizeAnswer } = require('../helper/ai');
const { executeSqlOnConnection, getSchemaSnapshot, getConnectionDetails } = require('../helper/connections');

async function askDbController(req, res, next) {
  try {
    const { connections_id, connection_id: connIdAlt, query: queryText, question: questionAlt, provider, model } = req.body || {};
    const connection_id = connections_id ?? connIdAlt;
    const question = (typeof queryText === 'string' ? queryText : questionAlt) || '';
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

    // Optional: include schema snapshot to improve accuracy
    let schemaText = '';
    try {
      const schema = await getSchemaSnapshot(connection_id);
      schemaText = Object.keys(schema).length ? `\nSchema JSON: ${JSON.stringify(schema)}` : '';
    } catch (_) {}

    // Also include active database name to guide information_schema filters
    let dbName = '';
    try {
      const conn = await getConnectionDetails(connection_id);
      dbName = conn && conn.database ? String(conn.database) : '';
    } catch (_) {}

    const rawSql = await generateQuery(
      `Rules:
1) Output exactly ONE MySQL SELECT statement.
2) Never use SHOW, DESCRIBE, EXPLAIN, or any non-SELECT statements.
3) For listing tables/columns, query information_schema.tables and information_schema.columns and filter table_schema='${dbName}'.
4) Do not modify data and do not include comments or markdown.

User question: ${question}
${schemaText}`
    , { provider, model });

    // Sanitize LLM output: remove markdown fences/backticks and keep only the first SELECT ... up to semicolon
    const sanitize = (s) => {
      let t = String(s || '').trim();
      t = t.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
      t = t.replace(/`/g, '');
      const m = t.match(/select[\s\S]*?(;|$)/i);
      return m ? m[0].replace(/;\s*$/, '').trim() : t;
    };
    const sql = sanitize(rawSql);

    // Execute SQL safely against the saved connection
    const rows = await executeSqlOnConnection(connection_id, sql);

    // Summarize the results back to natural language
    const answer = await summarizeAnswer(question, rows, { provider, model });

    res.json({ sql, rows, answer });
  } catch (error) {
    next(error);
  }
}

module.exports = { askDbController };

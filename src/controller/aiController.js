const { generateQuery, summarizeAnswer } = require('../helper/ai');
const { executeSqlOnConnection, getSchemaSnapshot } = require('../helper/connections');

async function askDbController(req, res, next) {
  try {
    const { connections_id, connection_id: connIdAlt, query: queryText, question: questionAlt } = req.body || {};
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

    // Ask OpenAI to generate a SQL query (SELECT only)
    const sql = await generateQuery(
      `Generate a single MySQL SELECT query to answer the user's question. Use only provided schema if possible. Do NOT write anything other than the SQL. No comments. No markdown.
Question: ${question}${schemaText}`
    );

    // Execute SQL safely against the saved connection
    const rows = await executeSqlOnConnection(connection_id, sql);

    // Summarize the results back to natural language
    const answer = await summarizeAnswer(question, rows);

    res.json({ sql, rows, answer });
  } catch (error) {
    next(error);
  }
}

module.exports = { askDbController };

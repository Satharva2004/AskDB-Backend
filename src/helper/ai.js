const { chat } = require('../config/llm');

async function generateQuery(prompt, { provider = process.env.LLM_PROVIDER || 'openai', model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo' } = {}) {
  try {
    const content = await chat(provider, [
      { role: 'system', content: 'You are a SQL query generator. Only output a single MySQL SELECT statement. No backticks, no markdown, no explanations.' },
      { role: 'user', content: prompt },
    ], { model, temperature: 0.1, max_tokens: 300 });
    return (content || '').trim();
  } catch (error) {
    console.error('Error generating query:', error);
    throw error;
  }
}

async function summarizeAnswer(question, rows, { provider = process.env.LLM_PROVIDER || 'openai', model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo' } = {}) {
  try {
    const preview = Array.isArray(rows) ? rows.slice(0, 50) : rows; // limit size
    const content = await chat(provider, [
      { role: 'system', content: 'You answer questions using provided SQL result rows. Be concise and accurate. If data is empty, say so.' },
      { role: 'user', content: `Question: ${question}\nRows (JSON array):\n${JSON.stringify(preview)}` },
    ], { model, temperature: 0.2, max_tokens: 300 });
    return (content || '').trim();
  } catch (error) {
    console.error('Error summarizing answer:', error);
    throw error;
  }
}

module.exports = { generateQuery, summarizeAnswer };

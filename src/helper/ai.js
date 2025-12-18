const { chat } = require('../config/llm');

async function generateQuery(prompt, { provider = 'gemini', model = 'gemini-1.5-flash-latest', history = [] } = {}) {
  try {
    const messages = [
      {
        role: 'system',
        content: `You are a SQL query generator. Only output a single MySQL SELECT statement never delete, drop or any harmfull queries to the database. No backticks, no markdown, no explanations.

UNDERSTANDING BUSINESS TERMS:
When user says "insight" or "trend" → Create time-series query with GROUP BY date
When user says "kpi" or "performance" → Query the kpis table or calculate key metrics
When user says "revenue" or "sales" → Use SUM(sales.amount)
When user says "top" or "best" → Add ORDER BY DESC LIMIT 10
When user says "breakdown" or "by category" → Add GROUP BY clause
When user says "average" → Use AVG() function
When user says "total" → Use SUM() function
When user says "growth" or "change" → Compare time periods

IMPORTANT RULES:
- Use proper JOINs when querying multiple tables
- Add WHERE clauses for relevant filtering
- Use date functions (DATE, MONTH, YEAR) for time-based queries
- Always include LIMIT to prevent huge result sets
- Only output a single MySQL SELECT statement`
      },
      ...history,
      { role: 'user', content: prompt },
    ];

    const content = await chat(provider, messages, { model, temperature: 0.1, max_tokens: 65536 });
    return (content || '').trim();
  } catch (error) {
    console.error('Error generating query:', error);
    throw error;
  }
}

async function analyzeData(question, rows, { provider = 'gemini', model = 'gemini-2.5-flash' } = {}) {
  try {
    const preview = Array.isArray(rows) ? rows.slice(0, 50) : rows;

    const content = await chat(provider, [
      {
        role: 'system',
        content: `
You are a data visualization engine for a clean, modern dashboard using @tremor/react.

Return ONLY valid JSON (no markdown, no explanations).

Allowed visualization types:
- "kpi" (single number)
- "line" (time trends)
- "bar" (category comparison)
- "table" (fallback)

DO NOT use pie, scatter, or complex charts.

Response format:
{
  "visual": {
    "type": "kpi" | "line" | "bar" | "table",
    "index": "x-axis key (string)",
    "categories": ["numericKey1", "numericKey2"]
  },
  "data": [ { "key": "value", ... } ],
  "summary": {
    "text": "here u have to explain the data to the user and the query and give a proper smummary and what it mean and how it can help the user"
  }
}

CRITICAL RULES:
- data must be a flat array of objects
- all rows must have the same keys
- numeric values MUST be numbers, not strings
- for "kpi" type: data should have one object with the metric
- for "line"/"bar": index is the x-axis, categories are y-axis metrics
- keep it simple and pretty
        `.trim()
      },
      {
        role: 'user',
        content: `Question: ${question}\nData: ${JSON.stringify(preview)}`
      }
    ], { model, temperature: 0.2, max_tokens: 65536 });

    const clean = (content || '').replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);

  } catch (error) {
    console.error('Error analyzing data:', error);
    return {
      visual: { type: "table" },
      data: Array.isArray(rows) ? rows : [],
      summary: { text: "Unable to analyze data." }
    };
  }
}


module.exports = { generateQuery, analyzeData };

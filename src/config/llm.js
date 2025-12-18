const https = require('https');

function requestJson({ host, path, method = 'POST', headers = {}, bodyObj }) {
  const payload = bodyObj ? JSON.stringify(bodyObj) : undefined;
  const opts = { host, path, method, headers: { ...headers } };
  if (payload) opts.headers['Content-Type'] = 'application/json';
  if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            const err = new Error(json.error?.message || json.error || 'LLM API error');
            err.status = res.statusCode;
            return reject(err);
          }
          resolve(json);
        } catch (e) {
          e.code = 'LLM_RESPONSE_PARSE_ERROR';
          reject(e);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function chatGemini(messages, { model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest', temperature = 0.2, max_tokens = 300 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const host = process.env.GEMINI_BASE_HOST || 'generativelanguage.googleapis.com';
  if (!apiKey) {
    const e = new Error('Missing GEMINI_API_KEY');
    e.code = 'GEMINI_API_KEY_MISSING';
    throw e;
  }
  // Convert OpenAI-style messages to Gemini contents
  // We join system+user+assistant messages into a sequence of parts
  const contents = [];
  let currentRole = null;
  let currentParts = [];
  const flush = () => {
    if (currentRole) contents.push({ role: currentRole, parts: currentParts.map((t) => ({ text: t })) });
    currentRole = null;
    currentParts = [];
  };
  for (const m of messages) {
    if (m.role !== currentRole) {
      flush();
      currentRole = m.role === 'system' ? 'user' : m.role; // Gemini doesn't support system; fold into user
      currentParts = [];
    }
    currentParts.push(String(m.content || ''));
  }
  flush();

  const bodyObj = {
    contents,
    generationConfig: { temperature, maxOutputTokens: max_tokens },
  };
  const makePath = (m) => `/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const json = await requestJson({ host, path: makePath(model), bodyObj });
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    return text;
  } catch (err) {
    if (err && err.status === 404 && !/\-latest$/.test(model)) {
      const fallback = `${model}-latest`;
      const json2 = await requestJson({ host, path: makePath(fallback), bodyObj });
      const text2 = json2.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return text2;
    }
    throw err;
  }
}

async function chat(provider, messages, options) {
  // Always default to Gemini regardless of the provider string
  return chatGemini(messages, options);
}

module.exports = { chat, chatGemini };

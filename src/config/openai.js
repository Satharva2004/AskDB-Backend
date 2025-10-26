const https = require('https');

function chat(messages, { model = 'gpt-3.5-turbo', temperature = 0.2, max_tokens = 300 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const host = process.env.OPENAI_BASE_URL || 'api.openai.com';
  if (!apiKey) {
    const e = new Error('Missing OPENAI_API_KEY');
    e.code = 'OPENAI_API_KEY_MISSING';
    throw e;
  }

  const payload = JSON.stringify({
    model,
    messages,
    temperature,
    max_tokens,
  });

  const options = {
    host,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            const err = new Error(json.error?.message || 'OpenAI API error');
            err.code = 'OPENAI_API_ERROR';
            err.status = res.statusCode;
            return reject(err);
          }
          const content = json.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (e) {
          e.code = 'OPENAI_RESPONSE_PARSE_ERROR';
          reject(e);
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

module.exports = { chat };

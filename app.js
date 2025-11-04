const express = require('express');
const userRoutes = require('./src/routes/user');
const { query } = require('./src/config/db');
const connectionRoutes = require('./src/routes/connections');
const aiRoutes = require('./src/routes/ai');
const cors = require('cors');
const app = express();

app.use(express.json());

const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:5173',
  'https://ask-aura.vercel.app',
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Health check endpoint with environment validation
app.get('/health', (req, res) => {
  const { app: appConfig, db: dbConfig, jwt: jwtConfig, meta } = require('./src/config/env');
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: process.env.NODE_ENV,
      port: appConfig.port,
      dotenvLoaded: meta.dotenvLoaded
    },
    database: {
      host: dbConfig.host ? 'configured' : 'missing',
      port: dbConfig.port || 'missing',
      user: dbConfig.user ? 'configured' : 'missing',
      database: dbConfig.database ? 'configured' : 'missing'
    },
    jwt: {
      secret: jwtConfig.secret ? 'configured' : 'missing',
      expiresIn: jwtConfig.expiresIn || 'missing'
    },
    apis: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      groq: process.env.GROQ_API_KEY ? 'configured' : 'missing',
      gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing'
    }
  };

  // Check if critical environment variables are missing
  const criticalMissing = [];
  if (!dbConfig.host) criticalMissing.push('DB_HOST');
  if (!dbConfig.user) criticalMissing.push('DB_USER');
  if (!dbConfig.password) criticalMissing.push('DB_PASSWORD');
  if (!dbConfig.database) criticalMissing.push('DB_NAME');
  if (!jwtConfig.secret) criticalMissing.push('JWT_SECRET');

  if (criticalMissing.length > 0) {
    health.status = 'unhealthy';
    health.errors = criticalMissing.map(env => `Missing environment variable: ${env}`);
    return res.status(500).json(health);
  }

  res.json(health);
});

app.use('/api/users', userRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/ai', aiRoutes);

app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  const body = {
    message: err.message || 'Internal Server Error',
  };

  if (err.code) {
    body.code = err.code;
  }

  res.status(status).json(body);
});


module.exports = app;

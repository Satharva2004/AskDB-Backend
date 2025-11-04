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

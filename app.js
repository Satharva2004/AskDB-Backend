const express = require('express');
const userRoutes = require('./src/routes/user');
const { query } = require('./src/config/db');
const connectionRoutes = require('./src/routes/connections');
const aiRoutes = require('./src/routes/ai');
const app = express();

app.use(express.json());

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

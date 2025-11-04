const express = require('express');
const userRoutes = require('./src/routes/user');
const { query } = require('./src/config/db');
const connectionRoutes = require('./src/routes/connections');
const aiRoutes = require('./src/routes/ai');
const cors = require('cors');
const app = express();

app.use(express.json());
app.use(cors({ origin: 'http://localhost:8080',
  origin: 'https://lovable.dev/projects/cc0a0a79-f112-4814-8c3f-f9233f3a3547',
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

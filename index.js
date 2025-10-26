const app = require('./app');
const { app: appConfig } = require('./src/config/env');

const PORT = appConfig.port;

app.listen(PORT, () => {
  console.log(`Server ready: http://localhost:${PORT}`);
});
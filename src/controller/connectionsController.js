const { createConnection } = require('../helper/connections');

async function createConnectionController(req, res, next) {
  try {
    const { db_type, host, port, user, password, database } = req.body || {};
    const user_id = req.user && req.user.id ? req.user.id : null;
    const connection = await createConnection({ db_type, host, port, user, password, database, user_id });
    res.json(connection);
  } catch (error) {
    next(error);
  }
}

module.exports = { createConnectionController };

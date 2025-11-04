const { createConnection, getConnectionDetails, listConnectionsForUser } = require('../helper/connections');

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

async function listConnectionsController(req, res, next) {
  try {
    const userId = req.user && req.user.id ? req.user.id : null;
    if (!userId) {
      const err = new Error('Authentication required');
      err.statusCode = 401;
      throw err;
    }

    const connections = await listConnectionsForUser(userId);
    res.json(connections);
  } catch (error) {
    next(error);
  }
}

async function getConnectionDetailsController(req, res, next) {
  try {
    const { id } = req.params || {};
    const connection = await getConnectionDetails(id);
    res.json(connection);
  } catch (error) {
    next(error);
  }
}

module.exports = { createConnectionController, listConnectionsController, getConnectionDetailsController };

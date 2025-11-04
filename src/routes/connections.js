const express = require('express');
const auth = require('../middleware/auth');
const { createConnectionController, listConnectionsController, getConnectionDetailsController } = require('../controller/connectionsController');

const router = express.Router();

// POST /api/connections
router.post('/', auth, createConnectionController);
router.get('/', auth, listConnectionsController);
router.get('/:id', auth, getConnectionDetailsController);

module.exports = router;

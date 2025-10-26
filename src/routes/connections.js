const express = require('express');
const auth = require('../middleware/auth');
const { createConnectionController } = require('../controller/connectionsController');

const router = express.Router();

// POST /api/connections
router.post('/', auth, createConnectionController);

module.exports = router;

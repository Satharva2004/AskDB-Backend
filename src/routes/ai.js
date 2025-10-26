const express = require('express');
const auth = require('../middleware/auth');
const { askDbController } = require('../controller/aiController');

const router = express.Router();

// POST /api/ai/query
router.post('/query', auth, askDbController);

module.exports = router;

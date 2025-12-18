const express = require('express');
const auth = require('../middleware/auth');
const {
    askDbController,
    getConversationsController,
    getMessagesController,
    deleteConversationController
} = require('../controller/aiController');

const router = express.Router();

// POST /api/ai/query
router.post('/query', auth, askDbController);

// GET /api/ai/conversations - Get all conversations for a connection
router.get('/conversations', auth, getConversationsController);

// GET /api/ai/messages - Get all messages in a conversation
router.get('/messages', auth, getMessagesController);

// DELETE /api/ai/conversations/:id - Delete a conversation
router.delete('/conversations/:id', auth, deleteConversationController);

module.exports = router;

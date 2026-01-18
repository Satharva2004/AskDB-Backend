const express = require('express');
const { registerUser, loginUser, getMe, githubLogin, githubCallback } = require('../controller/userController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', auth, getMe);

// GitHub Auth
router.get('/auth/github', githubLogin);
router.get('/auth/github/callback', githubCallback);

module.exports = router;
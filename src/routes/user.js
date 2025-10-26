const express = require('express');
const { registerUser, loginUser, getMe } = require('../controller/userController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', auth, getMe);

module.exports = router;
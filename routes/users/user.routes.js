const express = require('express');
const router = express.Router();
const userController = require('../../controller/users/user.controller');
const { authMiddleware } = require('../../middleware/auth.middleware');

// Define your user-related routes here
router.get('/profile', authMiddleware, userController.getUserProfile);


module.exports = router;
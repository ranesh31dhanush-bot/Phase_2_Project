const express = require('express');
const adminController = require('../../controller/admin/admin.controller');
const { adminMiddleware } = require('../../middleware/admin.middleware');
const { authMiddleware } = require('../../middleware/auth.middleware');

const router = express.Router();    

// Define your admin-related routes here

router.post('/products', authMiddleware, adminMiddleware, adminController.createProduct);


module.exports = router;
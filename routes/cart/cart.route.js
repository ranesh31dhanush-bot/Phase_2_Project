const express = require('express');
const cartController = require('../../controller/cart/cart.controller');
const {authMiddleware} = require('../../middleware/auth.middleware');

const router = express.Router();    

// routes/cart/cart.route.js
router.post('/add', authMiddleware, cartController.addToCart);
router.get('/', authMiddleware, cartController.getCart); 
router.get('/total', authMiddleware, cartController.getTotalCartValue); 
router.delete('/:productId', authMiddleware, cartController.removeFromCart);


module.exports = router;

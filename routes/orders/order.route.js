const express = require('express');
const router = express.Router();
const orderController = require('../../controller/orders/order.controller');
const {authMiddleware} = require('../../middleware/auth.middleware');

router.post('/', authMiddleware, orderController.createOrder);
router.get('/', authMiddleware, orderController.getUserOrders);
router.get('/:id', authMiddleware, orderController.getOrderById);

module.exports = router;
const express = require('express');
const productController = require('../../controller/products/product.controller');

const router = express.Router();

// Define your product-related routes here
router.get('/', productController.getAllProducts);
router.get('/:id', productController.getProductById);

module.exports = router;
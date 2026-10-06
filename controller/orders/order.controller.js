const { pool } = require('../../config/db');
const redisClient = require('../../config/redis');
const cartRepository = require('../../repositories/cart.repository');
const productRepository = require('../../repositories/product.repository');
const orderRepository = require('../../repositories/order.repository');
const { addOrderConfirmationEmailJob } = require('../../queues/email.queue');

module.exports.createOrder = async (req, res) => {
    // 1. Authenticate user
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
    }

    // 2. Read cart from Redis: cart:{userId}
    const cartKey = cartRepository._getKey(userId);
    const cartItems = await redisClient.hgetall(cartKey);

    // 3. Reject if cart is empty
    if (!cartItems || Object.keys(cartItems).length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
    }

    // Acquire dedicated client from the pool for the transaction
    const client = await pool.connect();

    try {
        // 4. Begin PostgreSQL transaction
        await client.query('BEGIN');

        const productIds = Object.keys(cartItems).map((id) => parseInt(id, 10));

        // 5 & 6. Atomically fetch and lock product rows with SELECT FOR UPDATE
        const products = await productRepository.findAndLockProductsByIds(productIds, client);

        let totalAmount = 0;
        const checkoutItems = [];

        // 7 & 8. Validate presence and stock for each item
        for (const [idStr, qtyStr] of Object.entries(cartItems)) {
            const productId = parseInt(idStr, 10);
            const quantity = parseInt(qtyStr, 10);
            const product = products.find((p) => p.id === productId);

            if (!product) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Product ID ${productId} not found` });
            }

            if (product.stock < quantity) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Insufficient stock for product "${product.name}". Available: ${product.stock}, requested: ${quantity}`,
                });
            }

            // 9. Calculate total using current locked product price
            totalAmount += product.price * quantity;

            checkoutItems.push({
                productId,
                quantity,
                priceAtPurchase: product.price,
            });
        }

        // 10. Insert record into orders table
        const order = await orderRepository.createOrder({ userId, totalAmount }, client);

        // 11 & 12. Insert all order_items and decrement product stock
        for (const item of checkoutItems) {
            await orderRepository.createOrderItem(
                {
                    orderId: order.id,
                    productId: item.productId,
                    quantity: item.quantity,
                    priceAtPurchase: item.priceAtPurchase,
                },
                client
            );

            await productRepository.decrementStock(item.productId, item.quantity, client);
        }

        // 13. Commit transaction
        await client.query('COMMIT');

        // 14. Clear Redis cart after successful commit
        await redisClient.del(cartKey);

        // Invalidate product listing cache because stock levels have changed
        const productKeys = await redisClient.keys('products:*');
        if (productKeys.length > 0) {
            await redisClient.del(productKeys);
        }

        // 15. Queue order confirmation email in background (non-blocking)
        if (req.user?.email && typeof addOrderConfirmationEmailJob === 'function') {
            addOrderConfirmationEmailJob(req.user.email, order.id, totalAmount, checkoutItems).catch((err) =>
                console.error('Failed to queue confirmation email:', err.message)
            );
        }

        // 16. Return created order response
        return res.status(201).json({
            message: 'Order placed successfully',
            orderId: order.id,
            totalAmount,
            itemsCount: checkoutItems.length,
        });
    } catch (error) {
        // Rollback any uncommitted operations on error
        await client.query('ROLLBACK');
        console.error('Error creating order:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        // Release the client connection back to the pool
        client.release();
    }
};


module.exports.getUserOrders = async (req, res) => {
    try {

        const userId = req.user?.id || req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;


        if (page < 1 || limit < 1) {
            return res.status(400).json({ error: 'Page and limit must be positive integers' });
        }

        const offset = (page - 1) * limit;

        const { orders, total } = await orderRepository.findByUserId(userId, limit, offset);

        return res.status(200).json({
            orders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        });


    } catch (error) {
        console.error('Error fetching user orders:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports.getOrderById = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const orderId = parseInt(req.params.id, 10);

        if (isNaN(orderId) || orderId <= 0) {
            return res.status(400).json({ error: 'Valid Order ID is required' });
        }

        const order = await orderRepository.findByIdAndUserId(orderId, userId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        return res.status(200).json({ order });

    } catch (error) {
        console.error('Error fetching order by ID:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
const cartRepository = require('../../repositories/cart.repository');
const productRepository = require('../../repositories/product.repository');

module.exports.addToCart = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        const { productId, quantity } = req.body;

        const parsedProductId = parseInt(productId, 10);
        const parsedQuantity = parseInt(quantity, 10);

        if (isNaN(parsedProductId) || parsedProductId <= 0) {
            return res.status(400).json({ error: 'Valid productId is required' });
        }
        if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
            return res.status(400).json({ error: 'Quantity must be a positive integer' });
        }

        // Check product in PostgreSQL
        const product = await productRepository.findById(parsedProductId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        // Check cumulative stock
        const currentQty = await cartRepository.getItemQuantity(userId, parsedProductId);
        const newTotalQty = currentQty + parsedQuantity;

        if (newTotalQty > product.stock) {
            return res.status(400).json({
                error: `Insufficient stock. Available: ${product.stock}, current in cart: ${currentQty}`,
            });
        }

        // Persist to Redis
        await cartRepository.setItem(userId, parsedProductId, newTotalQty);

        return res.status(200).json({
            message: 'Product added to cart successfully',
            productId: parsedProductId,
            quantity: newTotalQty,
        });
    } catch (error) {
        console.error('Error adding to cart:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports.getCart = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const productsInCart = await cartRepository.getCart(userId);
        const productIds = Object.keys(productsInCart || {});


        if (productIds.length === 0) {
            return res.status(200).json({
                items: [],
            });
        }

        const items = [];

        for (const idStr of productIds) {
            const productId = parseInt(idStr, 10);
            const quantity = productsInCart[idStr];
            const product = await productRepository.findById(productId);

            if (product) {
                items.push({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    stock: product.stock,
                    quantity,
                    subtotal: product.price * quantity,
                });
            }
        }

        return res.status(200).json({
            items,
        });
    }
    catch (error) {
        console.error('Error fetching cart:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports.removeFromCart = async (req, res) => {
    try {
        const userId = req.user?.id || req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { productId } = req.params;

        const parsedProductId = parseInt(productId, 10);

        if (isNaN(parsedProductId) || parsedProductId <= 0) {
            return res.status(400).json({ error: 'Valid productId is required' });
        }

        await cartRepository.removeItem(userId, parsedProductId);
        return res.status(200).json({
            message: 'Product removed from cart successfully',
            productId: parsedProductId,
        });

    } catch (error) {
        console.error('Error removing from cart:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

module.exports.getTotalCartValue = async (req, res) => {
    try {

        const userId = req.user?.id || req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }


        const productsInCart = await cartRepository.getCart(userId);
        const productIds = Object.keys(productsInCart || {});

        if (productIds.length === 0) {
            return res.status(200).json({
                total: 0,
            });
        }

        const productDetails = await Promise.all(
            productIds.map(async (idStr) => {
                const productId = parseInt(idStr, 10);
                const product = await productRepository.findById(productId);

                if (!product) {
                    await cartRepository.removeItem(userId, productId);
                    return null;
                }

                return {
                    price: product.price,
                    quantity: productsInCart[idStr],
                };
            })
        );


        const total = productDetails
        .filter(Boolean)
        .reduce((acc, item) => {
            return acc + (item.price * item.quantity);
        }, 0);

        return res.status(200).json({
            total,
        });


    } catch (error) {
        console.error('Error calculating total cart value:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}   
const redisClient = require('../../config/redis');
const productRepository = require('../../repositories/product.repository');


module.exports.createProduct = async (req, res) => {
    try {
        const { name, price, stock, category } = req.body;

        // Validate input
        if (!name || !price || stock === undefined || !category) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (typeof name !== 'string' || typeof category !== 'string') {
            return res.status(400).json({ error: 'Name and category must be strings' });
        }

        // 2. Validate integers and bounds[cite: 1]
        if (!Number.isInteger(price) || price <= 0) {
            return res.status(400).json({ error: 'Price must be a positive integer in paise/cents' });
        }

        if (!Number.isInteger(stock) || stock < 0) {
            return res.status(400).json({ error: 'Stock must be an integer greater than or equal to 0' });
        }

        // Insert the new product into the database
        const data = await productRepository.create({
            name: name.trim(),
            price,
            stock,
            category: category.toLowerCase().trim()
        });

        // 4. Invalidate only products cache keys (preserve carts and queues)[cite: 1]
        const productKeys = await redisClient.keys('products:*');
        if (productKeys.length > 0) {
            await redisClient.del(productKeys);
        }

        return res.status(201).json(data);


    } catch (error) {
        console.error('Error creating product:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
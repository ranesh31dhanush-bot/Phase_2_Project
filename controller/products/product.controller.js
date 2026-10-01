const redisClient = require('../../config/redis');
const productRepository = require('../../repositories/product.repository');

module.exports.getAllProducts = async (req, res) => {
    try {
        let { category, search, page = 1, limit = 10 } = req.query;

        page = parseInt(page, 10);
        limit = parseInt(limit, 10);

        if (isNaN(page) || page < 1) page = 1;
        if (isNaN(limit) || limit < 1) limit = 10;
        if (limit > 100) limit = 100; // Set a maximum limit to prevent abuse

        const offset = (page - 1) * limit;
        // console.log(`Fetching products with category: ${category}, search: ${search}, page: ${page}, limit: ${limit}, offset: ${offset}`);

        // 1. Define cacheKey FIRST before checking Redis
        const cacheKey = `products:${category || 'all'}:${search || 'all'}:page:${page}:limit:${limit}`;

        // 2. Check if the response is cached in Redis
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        }

        // 3. Cache miss: Fetch from database
        const { products, total } = await productRepository.findAll({ category, search, limit, offset });

        const totalPages = Math.ceil(total / limit) || 1;

        const responsePayload = {
            products,
            pagination: {
                page,
                limit,
                total,
                totalPages,
            },
        };

        // 4. Save to Redis with 10-minute TTL (600 seconds)
        await redisClient.setex(cacheKey, 600, JSON.stringify(responsePayload));

        return res.status(200).json(responsePayload);
    } catch (error) {
        console.error('Error fetching products:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports.getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const parsedId = parseInt(id, 10);

        if (isNaN(parsedId) || parsedId < 1) {
            return res.status(400).json({ error: 'Invalid product ID format' });
        }

        const cacheKey = `product:${parsedId}`;
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        }
        const product = await productRepository.findById(parsedId);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        let availability = 'out_of_stock';
        if (product.stock > 10) {
            availability = 'in_stock';
        } else if (product.stock >= 1) {
            availability = 'low_stock';
        }

        const responsePayload = {
            ...product,
            availability,
        };

        await redisClient.setex(cacheKey, 600, JSON.stringify(responsePayload));

        return res.status(200).json(responsePayload);
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}





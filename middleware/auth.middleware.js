const jwt = require('jsonwebtoken');


module.exports.authMiddleware = (req, res, next) => {

    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing' });
    }

    // 2. Expect "Bearer <token>" format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Invalid authorization format. Expected "Bearer <token>"' });
    }

    const token = parts[1];
    if (!token) {
        return res.status(401).json({ error: 'Token missing' });
    }

    jwt.verify(token, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = decoded;

        next();
    });

}
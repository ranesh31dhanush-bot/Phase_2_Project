module.exports.adminMiddleware = (req, res, next) => {
    // Check if the user is authenticated and has the 'admin' role
    if (!req.user || req.user.role !== 'admin') {   
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }       
    next();
}   
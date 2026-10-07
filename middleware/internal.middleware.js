
module.exports.internalAuthMiddleware = (req, res, next) => {
  const secret = req.headers['x-internal-secret'];
  const expectedSecret = process.env.INTERNAL_SECRET;

  if (!secret || secret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing internal secret' });
  }

  next();
};
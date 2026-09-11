const jwt = require('jsonwebtoken');

require('dotenv').config();

/**
 * Middleware: verify JWT from Authorization header.
 * On success, attaches decoded payload to req.user and calls next().
 * On failure, returns 401.
 */
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authorization header missing or malformed.' });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Session expired. Please log in again.'
        : 'Invalid token.';
      return res.status(401).json({ success: false, message });
    }

    req.user = decoded;
    next();
  });
}

module.exports = { verifyJWT };

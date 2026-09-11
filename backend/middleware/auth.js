const jwt = require('jsonwebtoken');

require('dotenv').config();

/**
 * Middleware: verify JWT from Authorization header.
 * On success, attaches decoded payload to req.user and calls next().
 * On failure, returns 401.
 */
function verifyJWT(req, res, next) {
  // TODO: Extract Bearer token from req.headers.authorization
  // TODO: Return 401 if header is missing or malformed
  // TODO: jwt.verify(token, process.env.JWT_SECRET, callback)
  // TODO: On error (expired, invalid signature), return 401 with descriptive message
  // TODO: On success, set req.user = decoded payload, call next()
}

module.exports = { verifyJWT };

'use strict';

const supabase = require('../config/supabase');

/**
 * Middleware: verify a Supabase Auth JWT issued to an advisor.
 *
 * Calls supabase.auth.getUser() with the Bearer token so Supabase validates
 * the signature and expiry. On success, attaches the Supabase user object to
 * req.advisor and calls next(). On failure, returns 401.
 *
 * This is separate from verifyJWT (which validates the custom client JWT).
 * Do not mix the two — client tokens and advisor tokens have different shapes.
 */
async function verifyAdvisorJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authorization header missing or malformed.',
    });
  }

  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session.',
    });
  }

  req.advisor = user;
  next();
}

module.exports = { verifyAdvisorJWT };

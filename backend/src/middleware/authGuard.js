const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'hcm_lite_super_secret_jwt_key_2026';

function authGuard(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid authorization token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Token is expired or invalid.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Forbidden: Access requires one of [${roles.join(', ')}] role(s). Your role is ${req.user?.role || 'NONE'}.`
      });
    }
    next();
  };
}

module.exports = {
  authGuard,
  requireRole,
  JWT_SECRET,
};

const jwt = require('jsonwebtoken');

const generateToken = (employeeId, expires, type, secret = process.env.JWT_SECRET) => {
  const payload = {
    sub: employeeId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expires,
    type,
  };
  return jwt.sign(payload, secret);
};

exports.generateAuthTokens = async (employee) => {
  const accessTokenExpires = parseInt(process.env.JWT_ACCESS_EXPIRATION_MINUTES || 15) * 60;
  const refreshTokenExpires = parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS || 7) * 24 * 60 * 60;

  const accessToken = generateToken(employee._id, accessTokenExpires, 'access');
  const refreshToken = generateToken(employee._id, refreshTokenExpires, 'refresh');

  return {
    access: {
      token: accessToken,
      expires: new Date(Date.now() + accessTokenExpires * 1000),
    },
    refresh: {
      token: refreshToken,
      expires: new Date(Date.now() + refreshTokenExpires * 1000),
    },
  };
};

exports.verifyToken = async (token, type) => {
  const secret = process.env.JWT_SECRET;
  const payload = jwt.verify(token, secret);
  
  if (payload.type !== type) {
    throw new Error('Invalid token type');
  }
  
  return payload;
};

exports.refreshAuthTokens = async (refreshToken) => {
  const payload = await verifyToken(refreshToken, 'refresh');
  return await generateAuthTokens({ _id: payload.sub });
};
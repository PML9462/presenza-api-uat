const requestIp = require("request-ip");

const allowedIPs = [
  "122.176.57.94", 
  "223.178.210.219"
];

// Middleware to restrict access based on IP
const ipWhitelistMiddleware = (req, res, next) => {
  //   const clientIP = req.ip || req.headers["x-forwarded-for"];

  const clientIP = requestIp.getClientIp(req);

  // Check if the client's IP is in the allowed list
  if (allowedIPs.includes(clientIP)) {
    return next(); // IP is allowed, continue to the route handler
  }

  // IP is not allowed, return 403 Forbidden
  return res
    .status(403)
    .json({ message: "You are not authorized to access the site." });
};

module.exports = ipWhitelistMiddleware;

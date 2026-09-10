// const { RateLimiterRedis } = require("rate-limiter-flexible");
// const Redis = require("ioredis");

// const redisClient = new Redis({
//   host: "localhost",
//   port: 6379,
//   enableOfflineQueue: false,
// });

// const rateLimiter = new RateLimiterRedis({
//   storeClient: redisClient,
//   keyPrefix: "rateLimiter",
//   points: 10, // Number of points (requests) allowed within the duration
//   duration: 7200, // Duration in seconds (2 hours)
//   blockDuration: 1, // Block duration in seconds after max points reached
// });

// const rateLimiterMiddleware = (req, res, next) => {
//   rateLimiter
//     .consume(req.ip)
//     .then(() => {
//       next();
//     })
//     .catch(() => {
//       res.status(429).json({
//         message: "Too many requests, please try again later.",
//       });
//     });
// };

// module.exports = rateLimiterMiddleware;

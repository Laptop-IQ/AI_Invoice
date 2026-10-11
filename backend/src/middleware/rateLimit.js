const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req),

  message: {
    error: {
      message: "Too many AI requests - please wait a minute and retry.",
    },
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  keyGenerator: (req) => ipKeyGenerator(req),

  message: {
    error: {
      message: "Too many auth attempts - please wait and retry.",
    },
  },
});

module.exports = {
  aiLimiter,
  authLimiter,
};

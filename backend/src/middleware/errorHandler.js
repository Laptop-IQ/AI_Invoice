const env = require("../config/env");
const ApiError = require("../utils/ApiError");

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  // MongoDB: duplicate key (unique index)
  if (err.code === 11000) {
    status = 409;
    message = "That value is already in use";
    details = err.keyValue;
  }

  // Mongoose: invalid ObjectId / bad cast
  else if (err.name === "CastError") {
    status = 400;
    message = "Invalid identifier";
  }

  // Mongoose: schema validation
  else if (err.name === "ValidationError" && err.errors) {
    status = 400;
    message = "Validation failed";
    details = Object.values(err.errors).map((e) => e.message);
  }

  // Zod validation error
  else if (err.name === "ZodError") {
    status = 400;
    message = "Validation failed";
    details = err.issues;
  }

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  return res.status(status).json({
    error: {
      message,
      ...(details ? { details } : {}),
      ...(env.isProd ? {} : { stack: err.stack }),
    },
  });
}

module.exports = {
  notFound,
  errorHandler,
};

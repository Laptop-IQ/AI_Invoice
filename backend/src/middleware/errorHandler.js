const env = require("../config/env");
const ApiError = require("../utils/ApiError");

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message || "Internal server error";
  let details = err.details;

  // PostgreSQL: unique constraint violation
  if (err.code === "23505") {
    status = 409;
    message = "That value is already in use";
    details = err.detail;
  }

  // PostgreSQL: foreign key violation
  else if (err.code === "23503") {
    status = 400;
    message = "Referenced record does not exist";
    details = err.detail;
  }

  // PostgreSQL: invalid text representation
  else if (err.code === "22P02") {
    status = 400;
    message = "Invalid identifier";
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

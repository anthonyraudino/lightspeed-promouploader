/**
 * Custom error classes
 */

class AppError extends Error {
  constructor(message, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

class ConfigError extends AppError {
  constructor(message) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

class AuthError extends AppError {
  constructor(message) {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

class ApiError extends AppError {
  constructor(message, statusCode = null, statusText = null) {
    super(message, "API_ERROR");
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.field = field;
  }
}

module.exports = {
  AppError,
  ConfigError,
  AuthError,
  ApiError,
  ValidationError
};

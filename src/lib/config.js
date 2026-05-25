const { ConfigError, ValidationError } = require("../utils/errors");
const { loadEnv } = require("../utils/env");

/**
 * Validate and retrieve OAuth configuration
 * @returns {Object} OAuth config
 */
function getOAuthConfig() {
  loadEnv();

  const config = {
    clientId: process.env.LS_CLIENT_ID,
    clientSecret: process.env.LS_CLIENT_SECRET,
    redirectUri: process.env.LS_REDIRECT_URI,
    scopes: process.env.LS_SCOPES || "products:read sales:read customers:read"
  };

  if (!config.clientId) {
    throw new ConfigError("Missing LS_CLIENT_ID in .env");
  }
  if (!config.clientSecret) {
    throw new ConfigError("Missing LS_CLIENT_SECRET in .env");
  }
  if (!config.redirectUri) {
    throw new ConfigError("Missing LS_REDIRECT_URI in .env");
  }

  return config;
}

/**
 * Validate and retrieve token configuration
 * @returns {Object} Token config
 */
function getTokenConfig() {
  loadEnv();

  const config = {
    accessToken: process.env.LS_ACCESS_TOKEN,
    refreshToken: process.env.LS_REFRESH_TOKEN,
    expiresAt: process.env.LS_TOKEN_EXPIRES_AT,
    domainPrefix: process.env.LS_DOMAIN_PREFIX
  };

  if (!config.accessToken) {
    throw new ConfigError("No access token found. Complete OAuth setup first using: npm run auth");
  }

  return config;
}

/**
 * Validate upload command arguments
 * @param {Object} args - Command arguments
 * @returns {Object} Validated arguments
 */
function validateUploadArgs(args) {
  const promotionId = args.promotion || process.env.LS_PROMOTION_ID;
  let file = args.file || "june-member-codes.csv";

  if (!promotionId) {
    throw new ValidationError(
      "Missing promotion ID. Add LS_PROMOTION_ID to .env or pass --promotion",
      "promotion"
    );
  }

  // Prepend csv/ if file doesn't already have a path
  if (!file.includes("/")) {
    file = `csv/${file}`;
  }

  const batchSize = Number(args.batchSize || 250);
  const maxRedemptions = Number(args.maxRedemptions || 1);
  const dryRun = Boolean(args.dryRun);

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new ValidationError("--batchSize must be a positive number", "batchSize");
  }

  if (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0) {
    throw new ValidationError("--maxRedemptions must be a positive number", "maxRedemptions");
  }

  return { promotionId, file, batchSize, maxRedemptions, dryRun };
}

/**
 * Validate code generation arguments
 * @param {Object} args - Command arguments
 * @returns {Object} Validated arguments
 */
function validateGenerateArgs(args) {
  const count = Number(args.count || 1000);
  const length = Number(args.length || 8);
  const prefix = String(args.prefix || "BABJUNE-").toUpperCase();
  const out = String(args.out || "csv/promo-codes.csv");
  const charset = String(args.charset || "ABCDEFGHJKLMNPQRSTUVWXYZ23456789").toUpperCase();

  if (!Number.isInteger(count) || count <= 0) {
    throw new ValidationError("--count must be a positive number", "count");
  }

  if (!Number.isInteger(length) || length <= 0) {
    throw new ValidationError("--length must be a positive number", "length");
  }

  if (!charset.length) {
    throw new ValidationError("Charset cannot be empty", "charset");
  }

  return { count, length, prefix, out, charset };
}

module.exports = {
  getOAuthConfig,
  getTokenConfig,
  validateUploadArgs,
  validateGenerateArgs
};

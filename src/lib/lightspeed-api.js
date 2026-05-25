const { ApiError, ConfigError } = require("../utils/errors");
const oauth = require("./oauth");
const { loadEnv } = require("../utils/env");

const DEFAULT_API_VERSION = "2026-04";
const BATCH_SIZE = 250;

/**
 * Parse Retry-After header value
 * @param {string} headerValue - Retry-After header value
 * @returns {number} Milliseconds to wait
 */
function parseRetryAfter(headerValue) {
  if (!headerValue) return 60_000;

  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds)) {
    return Math.max(seconds * 1000, 1000);
  }

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    return Math.max(dateMs - Date.now(), 1000);
  }

  return 60_000;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make HTTP request to Lightspeed API with retry logic
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method
 * @param {string} options.path - API path
 * @param {Object} options.body - Request body
 * @param {number} options.maxAttempts - Max retry attempts (default: 5)
 * @returns {Promise<Object|string>} Response data
 */
async function lightspeedRequest({ method, path, body, maxAttempts = 5 }) {
  loadEnv();

  const domainPrefix = process.env.LS_DOMAIN_PREFIX;
  const apiVersion = process.env.LS_API_VERSION || DEFAULT_API_VERSION;

  if (!domainPrefix) {
    throw new ConfigError("Missing LS_DOMAIN_PREFIX in .env");
  }

  let accessToken;
  try {
    accessToken = await oauth.getValidAccessToken();
  } catch (error) {
    throw new ApiError(
      `Authentication failed: ${error.message}\nPlease complete OAuth setup first using: npm run auth`
    );
  }

  const url = `https://${domainPrefix}.retail.lightspeed.app/api/${apiVersion}${path}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");

    if (rateLimitRemaining !== null) {
      console.log(`Rate limit remaining: ${rateLimitRemaining}`);
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      console.warn(`Rate limited. Waiting ${Math.ceil(retryAfterMs / 1000)}s before retrying...`);
      await sleep(retryAfterMs);
      continue;
    }

    if (!response.ok) {
      throw new ApiError(
        [
          `Lightspeed API error`,
          `Method: ${method}`,
          `URL: ${url}`,
          `Status: ${response.status}`,
          `Body: ${text}`
        ].join("\n"),
        response.status,
        response.statusText
      );
    }

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  throw new ApiError(`Failed after ${maxAttempts} attempts: ${method} ${path}`);
}

/**
 * Get promotion by ID
 * @param {string} promotionId - Promotion ID
 * @returns {Promise<Object>} Promotion data
 */
async function getPromotion(promotionId) {
  const response = await lightspeedRequest({
    method: "GET",
    path: `/promotions/${promotionId}`
  });
  return response.data || response;
}

/**
 * Build promo code object
 * @param {string} code - Promo code
 * @param {number} maxRedemptions - Max redemption limit
 * @returns {Object} Promo code object
 */
function makePromoCodeObject(code, maxRedemptions) {
  const codeField = process.env.LS_PROMO_CODE_FIELD || "code";
  return {
    [codeField]: code,
    limit: maxRedemptions
  };
}

/**
 * Remove read-only fields from promotion object before PUT
 * @param {Object} promotion - Promotion object
 * @returns {Object} Cleaned promotion object
 */
function removeReadOnlyPromotionFields(promotion) {
  const copy = JSON.parse(JSON.stringify(promotion));
  delete copy.id;
  delete copy.promo_code_summary;
  delete copy.version;
  delete copy.created_at;
  delete copy.updated_at;
  return copy;
}

/**
 * Split array into chunks
 * @param {Array} items - Items to split
 * @param {number} size - Chunk size
 * @returns {Array<Array>} Array of chunks
 */
function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Update promotion with promo codes
 * @param {string} promotionId - Promotion ID
 * @param {string[]} codes - Promo codes to add
 * @param {number} maxRedemptions - Max redemptions per code
 * @returns {Promise<Object>} Update response
 */
async function updatePromotionWithCodes(promotionId, codes, maxRedemptions) {
  const existingPromotion = await getPromotion(promotionId);

  const payload = {
    name: existingPromotion.name,
    description: existingPromotion.description,
    start_time: existingPromotion.start_time,
    end_time: existingPromotion.end_time,
    status: existingPromotion.status,
    condition: existingPromotion.condition,
    action: existingPromotion.action,
    channels: existingPromotion.channels,
    outlet_ids: existingPromotion.outlet_ids,
    customer_group_ids: existingPromotion.customer_group_ids,
    loyalty_multiplier: existingPromotion.loyalty_multiplier,
    combinable_with_coupon: existingPromotion.combinable_with_coupon,
    show_potential: existingPromotion.show_potential,
    use_promo_code: true,
    add_promo_code: codes.map((code) => makePromoCodeObject(code, maxRedemptions))
  };

  if (process.env.LS_INCLUDE_SET_PROMO_CODE !== "false") {
    payload.set_promo_code = true;
  }

  return lightspeedRequest({
    method: "PUT",
    path: `/promotions/${promotionId}`,
    body: payload
  });
}

module.exports = {
  lightspeedRequest,
  getPromotion,
  updatePromotionWithCodes,
  makePromoCodeObject,
  removeReadOnlyPromotionFields,
  chunkArray,
  sleep,
  parseRetryAfter
};

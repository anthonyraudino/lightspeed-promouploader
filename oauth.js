const fs = require("fs");
const https = require("https");
const { URL, URLSearchParams } = require("url");

/**
 * OAuth 2.0 handler for Lightspeed Retail (X-Series) API
 * Implements Authorization Code Grant flow as documented at:
 * https://x-series-api.lightspeedhq.com/docs/authorization
 */

const LIGHTSPEED_AUTH_URL = "https://secure.retail.lightspeed.app/connect";
const LIGHTSPEED_TOKEN_ENDPOINT = "api/1.0/token";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

function generateState(length = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let state = "";
  for (let i = 0; i < length; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return state;
}

function buildAuthorizationUrl() {
  const clientId = process.env.LS_CLIENT_ID;
  const redirectUri = process.env.LS_REDIRECT_URI;
  const scopes = process.env.LS_SCOPES || "products:read sales:read customers:read";
  const state = generateState();

  if (!clientId) throw new Error("Missing LS_CLIENT_ID in .env");
  if (!redirectUri) throw new Error("Missing LS_REDIRECT_URI in .env");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state,
    scope: scopes
  });

  return {
    url: `${LIGHTSPEED_AUTH_URL}?${params.toString()}`,
    state: state
  };
}

/**
 * Exchange authorization code for access token
 * @param {string} code - Authorization code from redirect
 * @param {string} domainPrefix - Domain prefix from redirect
 * @returns {Promise<Object>} Token response with access_token, refresh_token, etc.
 */
async function exchangeCodeForToken(code, domainPrefix) {
  const clientId = process.env.LS_CLIENT_ID;
  const clientSecret = process.env.LS_CLIENT_SECRET;
  const redirectUri = process.env.LS_REDIRECT_URI;

  if (!clientId) throw new Error("Missing LS_CLIENT_ID in .env");
  if (!clientSecret) throw new Error("Missing LS_CLIENT_SECRET in .env");
  if (!redirectUri) throw new Error("Missing LS_REDIRECT_URI in .env");
  if (!domainPrefix) throw new Error("Missing domainPrefix parameter");
  if (!code) throw new Error("Missing code parameter");

  const params = new URLSearchParams({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const tokenEndpoint = `https://${domainPrefix}.retail.lightspeed.app/${LIGHTSPEED_TOKEN_ENDPOINT}`;

  return new Promise((resolve, reject) => {
    const url = new URL(tokenEndpoint);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(params.toString())
      }
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode >= 400) {
            reject(new Error(`Token exchange failed (${res.statusCode}): ${data}`));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new Error(`Failed to parse token response: ${error.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(params.toString());
    req.end();
  });
}

/**
 * Refresh an expired access token using the refresh token
 * @param {string} refreshToken - Refresh token from previous token response
 * @param {string} domainPrefix - Domain prefix for the token endpoint
 * @returns {Promise<Object>} New token response
 */
async function refreshAccessToken(refreshToken, domainPrefix) {
  const clientId = process.env.LS_CLIENT_ID;
  const clientSecret = process.env.LS_CLIENT_SECRET;

  if (!clientId) throw new Error("Missing LS_CLIENT_ID in .env");
  if (!clientSecret) throw new Error("Missing LS_CLIENT_SECRET in .env");
  if (!refreshToken) throw new Error("Missing refreshToken parameter");
  if (!domainPrefix) throw new Error("Missing domainPrefix parameter");

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });

  const tokenEndpoint = `https://${domainPrefix}.retail.lightspeed.app/${LIGHTSPEED_TOKEN_ENDPOINT}`;

  return new Promise((resolve, reject) => {
    const url = new URL(tokenEndpoint);

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(params.toString())
      }
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);

          if (res.statusCode >= 400) {
            reject(new Error(`Token refresh failed (${res.statusCode}): ${data}`));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new Error(`Failed to parse token response: ${error.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(params.toString());
    req.end();
  });
}

/**
 * Save token credentials to .env file
 * @param {Object} tokenData - Token response from Lightspeed
 * @param {string} tokenData.access_token - Access token
 * @param {string} tokenData.refresh_token - Refresh token
 * @param {number} tokenData.expires - Absolute expiration timestamp (seconds)
 * @param {number} tokenData.expires_in - Relative expiration in seconds
 * @param {string} tokenData.domain_prefix - Domain prefix for this token
 * @param {string} file - .env file path
 */
function saveTokenToEnv(tokenData, file = ".env") {
  if (!tokenData.access_token) {
    throw new Error("Missing access_token in token data");
  }
  if (!tokenData.refresh_token) {
    throw new Error("Missing refresh_token in token data");
  }
  if (!tokenData.domain_prefix) {
    throw new Error("Missing domain_prefix in token data");
  }

  const expiresAtMs = tokenData.expires
    ? tokenData.expires * 1000
    : Date.now() + (tokenData.expires_in || 86400) * 1000;

  // Read existing .env
  let envContent = "";
  if (fs.existsSync(file)) {
    envContent = fs.readFileSync(file, "utf8");
  }

  // Remove existing token variables if present
  envContent = envContent
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("LS_ACCESS_TOKEN=") &&
        !line.startsWith("LS_REFRESH_TOKEN=") &&
        !line.startsWith("LS_TOKEN_EXPIRES_AT=") &&
        !line.startsWith("LS_DOMAIN_PREFIX=")
    )
    .join("\n");

  // Add new token variables
  const tokenLines = [
    `LS_ACCESS_TOKEN="${tokenData.access_token}"`,
    `LS_REFRESH_TOKEN="${tokenData.refresh_token}"`,
    `LS_TOKEN_EXPIRES_AT="${expiresAtMs}"`,
    `LS_DOMAIN_PREFIX="${tokenData.domain_prefix}"`
  ];

  envContent = (envContent.trim() + "\n" + tokenLines.join("\n") + "\n").trim() + "\n";

  fs.writeFileSync(file, envContent, "utf8");

  console.log("✓ Token saved to .env");
  console.log(`  - Access token: ${tokenData.access_token.substring(0, 10)}...`);
  console.log(`  - Expires at: ${new Date(expiresAtMs).toISOString()}`);
  console.log(`  - Domain: ${tokenData.domain_prefix}`);
}

/**
 * Check if token needs refresh
 * @returns {boolean} True if token is expired or expiring soon
 */
function isTokenExpired() {
  const expiresAt = process.env.LS_TOKEN_EXPIRES_AT;
  if (!expiresAt) return true;

  const expiresAtMs = Number(expiresAt);
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer

  return Date.now() + bufferMs >= expiresAtMs;
}

/**
 * Get valid access token, refreshing if necessary
 * @returns {Promise<string>} Valid access token
 */
async function getValidAccessToken() {
  loadEnv();

  const accessToken = process.env.LS_ACCESS_TOKEN;
  const refreshToken = process.env.LS_REFRESH_TOKEN;
  const domainPrefix = process.env.LS_DOMAIN_PREFIX;

  if (!accessToken) {
    throw new Error(
      "No access token found. Complete OAuth flow first using: node oauth.js authorize"
    );
  }

  if (!isTokenExpired()) {
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error("Token expired and no refresh token available. Reauthorize using: node oauth.js authorize");
  }

  if (!domainPrefix) {
    throw new Error("Missing domain_prefix. Reauthorize using: node oauth.js authorize");
  }

  console.log("Token expired, refreshing...");

  const newTokenData = await refreshAccessToken(refreshToken, domainPrefix);
  saveTokenToEnv(newTokenData);

  return newTokenData.access_token;
}

module.exports = {
  loadEnv,
  generateState,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  saveTokenToEnv,
  isTokenExpired,
  getValidAccessToken
};

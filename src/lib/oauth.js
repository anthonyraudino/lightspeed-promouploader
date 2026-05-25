const fs = require("fs");
const https = require("https");
const { URL, URLSearchParams } = require("url");
const { AuthError } = require("../utils/errors");
const { loadEnv, saveEnv } = require("../utils/env");

const LIGHTSPEED_AUTH_URL = "https://secure.retail.lightspeed.app/connect";
const LIGHTSPEED_TOKEN_ENDPOINT = "api/1.0/token";

/**
 * Generate random state string for OAuth
 * @param {number} length - Length of state string (default: 32)
 * @returns {string} Random state
 */
function generateState(length = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let state = "";
  for (let i = 0; i < length; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return state;
}

/**
 * Build OAuth authorization URL
 * @param {string} clientId - OAuth client ID
 * @param {string} redirectUri - OAuth redirect URI
 * @param {string} scopes - Space-separated scopes
 * @returns {Object} { url, state }
 */
function buildAuthorizationUrl(clientId, redirectUri, scopes) {
  if (!clientId) throw new AuthError("Missing clientId");
  if (!redirectUri) throw new AuthError("Missing redirectUri");

  const state = generateState();
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
 * @param {string} clientId - OAuth client ID
 * @param {string} clientSecret - OAuth client secret
 * @param {string} redirectUri - OAuth redirect URI
 * @returns {Promise<Object>} Token response
 */
async function exchangeCodeForToken(code, domainPrefix, clientId, clientSecret, redirectUri) {
  if (!clientId) throw new AuthError("Missing clientId");
  if (!clientSecret) throw new AuthError("Missing clientSecret");
  if (!redirectUri) throw new AuthError("Missing redirectUri");
  if (!domainPrefix) throw new AuthError("Missing domainPrefix");
  if (!code) throw new AuthError("Missing code");

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
            reject(new AuthError(`Token exchange failed (${res.statusCode}): ${data}`));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new AuthError(`Failed to parse token response: ${error.message}`));
        }
      });
    });

    req.on("error", reject);
    req.write(params.toString());
    req.end();
  });
}

/**
 * Refresh an expired access token
 * @param {string} refreshToken - Refresh token
 * @param {string} domainPrefix - Domain prefix
 * @param {string} clientId - OAuth client ID
 * @param {string} clientSecret - OAuth client secret
 * @returns {Promise<Object>} New token response
 */
async function refreshAccessToken(refreshToken, domainPrefix, clientId, clientSecret) {
  if (!clientId) throw new AuthError("Missing clientId");
  if (!clientSecret) throw new AuthError("Missing clientSecret");
  if (!refreshToken) throw new AuthError("Missing refreshToken");
  if (!domainPrefix) throw new AuthError("Missing domainPrefix");

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
            reject(new AuthError(`Token refresh failed (${res.statusCode}): ${data}`));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(new AuthError(`Failed to parse token response: ${error.message}`));
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
 */
function saveTokenToEnv(tokenData) {
  if (!tokenData.access_token) {
    throw new AuthError("Missing access_token in token data");
  }
  if (!tokenData.refresh_token) {
    throw new AuthError("Missing refresh_token in token data");
  }
  if (!tokenData.domain_prefix) {
    throw new AuthError("Missing domain_prefix in token data");
  }

  const expiresAtMs = tokenData.expires
    ? tokenData.expires * 1000
    : Date.now() + (tokenData.expires_in || 86400) * 1000;

  saveEnv({
    LS_ACCESS_TOKEN: tokenData.access_token,
    LS_REFRESH_TOKEN: tokenData.refresh_token,
    LS_TOKEN_EXPIRES_AT: expiresAtMs.toString(),
    LS_DOMAIN_PREFIX: tokenData.domain_prefix
  });

  console.log("✓ Token saved to .env");
  console.log(`  - Access token: ${tokenData.access_token.substring(0, 10)}...`);
  console.log(`  - Expires at: ${new Date(expiresAtMs).toISOString()}`);
  console.log(`  - Domain: ${tokenData.domain_prefix}`);
}

/**
 * Check if token needs refresh (with 5-minute buffer)
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
  const clientId = process.env.LS_CLIENT_ID;
  const clientSecret = process.env.LS_CLIENT_SECRET;

  if (!accessToken) {
    throw new AuthError("No access token found. Complete OAuth setup first using: npm run auth");
  }

  if (!isTokenExpired()) {
    return accessToken;
  }

  if (!refreshToken) {
    throw new AuthError("Token expired and no refresh token available. Reauthorize using: npm run auth");
  }

  if (!domainPrefix) {
    throw new AuthError("Missing domain_prefix. Reauthorize using: npm run auth");
  }

  console.log("Token expired, refreshing...");

  const newTokenData = await refreshAccessToken(refreshToken, domainPrefix, clientId, clientSecret);
  saveTokenToEnv(newTokenData);

  return newTokenData.access_token;
}

module.exports = {
  generateState,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  saveTokenToEnv,
  isTokenExpired,
  getValidAccessToken
};

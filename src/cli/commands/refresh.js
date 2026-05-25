const oauth = require("../../lib/oauth");
const { loadEnv } = require("../../utils/env");

/**
 * Refresh OAuth token
 */
async function refresh() {
  try {
    loadEnv();
    const token = await oauth.getValidAccessToken();
    console.log("✓ Token is valid or was refreshed");
    console.log(`Access token: ${token.substring(0, 10)}...`);
  } catch (error) {
    console.error("✗ Token refresh failed:", error.message);
    process.exit(1);
  }
}

module.exports = { refresh };

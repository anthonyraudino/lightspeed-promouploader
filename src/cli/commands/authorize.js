const fs = require("fs");
const readline = require("readline");
const { createServer } = require("http");
const { URL } = require("url");
const oauth = require("../../lib/oauth");
const { getOAuthConfig } = require("../../lib/config");
const { saveEnv, loadEnv } = require("../../utils/env");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Collect OAuth credentials from user
 */
async function setupCredentials() {
  console.log("\n=== Lightspeed X-Series OAuth Setup ===\n");
  console.log("Before proceeding, you need to create a Lightspeed Developer application:");
  console.log("1. Register: https://developers.retail.lightspeed.app/register");
  console.log("2. Create app: https://developers.retail.lightspeed.app/applications/add");
  console.log("3. Note your client_id, client_secret, and set redirect_uri\n");

  let existingEnv = {};
  if (fs.existsSync(".env")) {
    loadEnv();
    existingEnv = {
      clientId: process.env.LS_CLIENT_ID,
      clientSecret: process.env.LS_CLIENT_SECRET,
      redirectUri: process.env.LS_REDIRECT_URI,
      scopes: process.env.LS_SCOPES
    };
  }

  const clientId =
    (await question(`Enter Client ID${existingEnv.clientId ? ` [${existingEnv.clientId}]` : ""}: `)) ||
    existingEnv.clientId;

  const clientSecret =
    (await question(
      `Enter Client Secret${existingEnv.clientSecret ? ` [${existingEnv.clientSecret.substring(0, 5)}...]` : ""}: `
    )) || existingEnv.clientSecret;

  const redirectUri =
    (await question(
      `Enter Redirect URI${existingEnv.redirectUri ? ` [${existingEnv.redirectUri}]` : ""} (e.g., http://localhost:3000/callback): `
    )) || existingEnv.redirectUri;

  const scopes =
    (await question(
      `Enter Scopes${existingEnv.scopes ? ` [${existingEnv.scopes}]` : ""} (space-separated, e.g., products:read sales:read): `
    )) || existingEnv.scopes;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("✗ Missing required credentials");
    process.exit(1);
  }

  saveEnv({
    LS_CLIENT_ID: clientId,
    LS_CLIENT_SECRET: clientSecret,
    LS_REDIRECT_URI: redirectUri,
    LS_SCOPES: scopes || "products:read sales:read customers:read"
  });

  console.log("✓ Credentials saved to .env\n");

  return { clientId, clientSecret, redirectUri, scopes };
}

/**
 * Start callback server and perform authorization flow
 */
async function performAuthorizationFlow() {
  loadEnv();

  const config = getOAuthConfig();
  const { url: authUrl } = oauth.buildAuthorizationUrl(
    config.clientId,
    config.redirectUri,
    config.scopes
  );

  console.log("\n=== Authorization URL ===\n");
  console.log("Open this URL in your browser to authorize:\n");
  console.log(authUrl);
  console.log("\nAfter authorization, you will be redirected.\n");

  let server;
  const callbackPromise = new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${getPortFromRedirectUri()}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const domainPrefix = url.searchParams.get("domain_prefix");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<h1>Authorization Failed</h1><p>Error: ${error}</p><p>You can close this window.</p>`
        );
        reject(new Error(`Authorization denied: ${error}`));
      } else if (code && domainPrefix) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p>`
        );
        resolve({ code, domainPrefix });
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Invalid Callback</h1><p>Missing code or domain_prefix</p>`);
        reject(new Error("Invalid callback parameters"));
      }

      server.close();
    });

    const port = getPortFromRedirectUri();
    server.listen(port, () => {
      console.log(`Listening on http://localhost:${port}/callback`);
    });
  });

  try {
    const { code, domainPrefix } = await callbackPromise;

    if (!code) {
      throw new Error("No authorization code received");
    }

    console.log(`Received code: ${code.substring(0, 10)}...`);
    console.log(`Domain: ${domainPrefix}`);

    console.log("\nExchanging authorization code for access token...");

    const tokenData = await oauth.exchangeCodeForToken(
      code,
      domainPrefix,
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    oauth.saveTokenToEnv(tokenData);

    console.log("\n✓ OAuth setup complete!");
    console.log(`\nYou can now upload codes with: npm run upload -- --file <csv-file> --promotion <promotion-id>`);
  } catch (error) {
    console.error("✗ Authorization failed:", error.message);
    if (server) server.close();
    throw error;
  }
}

function getPortFromRedirectUri() {
  loadEnv();
  const redirectUri = process.env.LS_REDIRECT_URI;
  if (!redirectUri) return 3000;

  try {
    const url = new URL(redirectUri);
    return url.port || (url.protocol === "https:" ? 443 : 80);
  } catch {
    return 3000;
  }
}

/**
 * Main authorize command
 */
async function authorize() {
  try {
    await setupCredentials();
    await performAuthorizationFlow();
  } catch (error) {
    console.error("Authorization failed:", error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

module.exports = { authorize };

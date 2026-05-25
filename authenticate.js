#!/usr/bin/env node

const fs = require("fs");
const readline = require("readline");
const { createServer } = require("http");
const oauth = require("./oauth");

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
 * Step 1: Collect OAuth credentials from user
 */
async function setupCredentials() {
  console.log("\n=== Lightspeed X-Series OAuth Setup ===\n");
  console.log("Before proceeding, you need to create a Lightspeed Developer application:");
  console.log("1. Register: https://developers.retail.lightspeed.app/register");
  console.log("2. Create app: https://developers.retail.lightspeed.app/applications/add");
  console.log("3. Note your client_id, client_secret, and set redirect_uri\n");

  let existingEnv = {};
  if (fs.existsSync(".env")) {
    oauth.loadEnv();
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
      `Enter Scopes${existingEnv.scopes ? ` [${existingEnv.scopes}]` : ""} (space-separated, e.g., products:read sales:read customers:read): `
    )) || existingEnv.scopes;

  if (!clientId || !clientSecret || !redirectUri) {
    console.error("✗ Missing required credentials");
    process.exit(1);
  }

  // Save credentials to .env
  let envContent = "";
  if (fs.existsSync(".env")) {
    envContent = fs.readFileSync(".env", "utf8");
  }

  // Remove existing OAuth config if present
  envContent = envContent
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("LS_CLIENT_ID=") &&
        !line.startsWith("LS_CLIENT_SECRET=") &&
        !line.startsWith("LS_REDIRECT_URI=") &&
        !line.startsWith("LS_SCOPES=")
    )
    .join("\n");

  const lines = [
    `LS_CLIENT_ID="${clientId}"`,
    `LS_CLIENT_SECRET="${clientSecret}"`,
    `LS_REDIRECT_URI="${redirectUri}"`,
    `LS_SCOPES="${scopes || "products:read sales:read customers:read"}"`
  ];

  envContent = (envContent.trim() + "\n" + lines.join("\n") + "\n").trim() + "\n";
  fs.writeFileSync(".env", envContent, "utf8");

  console.log("✓ Credentials saved to .env\n");

  return { clientId, clientSecret, redirectUri, scopes };
}

/**
 * Step 2: Start callback server and open authorization URL
 */
async function performAuthorizationFlow() {
  oauth.loadEnv();

  const { url: authUrl, state } = oauth.buildAuthorizationUrl();

  console.log("\n=== Authorization URL ===\n");
  console.log("Open this URL in your browser to authorize:\n");
  console.log(authUrl);
  console.log("\nAfter authorization, you will be redirected.\n");

  // Start local callback server
  let server;
  const callbackPromise = new Promise((resolve, reject) => {
    server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${getPortFromRedirectUri()}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      const domainPrefix = url.searchParams.get("domain_prefix");

      // Respond to browser
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
        resolve({ code, domainPrefix, state: returnedState });
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

    // Step 3: Exchange code for token
    console.log("\nExchanging authorization code for access token...");

    const tokenData = await oauth.exchangeCodeForToken(code, domainPrefix);

    // Save token to .env
    oauth.saveTokenToEnv(tokenData);

    console.log("\n✓ OAuth setup complete!");
    console.log(`\nYou can now use the uploader with: node upload-codes.js --file <csv-file> --promotion <promotion-id>`);
  } catch (error) {
    console.error("✗ Authorization failed:", error.message);
    if (server) server.close();
    throw error;
  }
}

function getPortFromRedirectUri() {
  oauth.loadEnv();
  const redirectUri = process.env.LS_REDIRECT_URI;
  if (!redirectUri) return 3000;

  try {
    const url = new URL(redirectUri);
    return url.port || (url.protocol === "https:" ? 443 : 80);
  } catch {
    return 3000;
  }
}

async function main() {
  const command = process.argv[2];

  if (command === "authorize" || command === "setup") {
    try {
      await setupCredentials();
      await performAuthorizationFlow();
    } catch (error) {
      console.error("Setup failed:", error.message);
      process.exit(1);
    }
  } else if (command === "refresh") {
    try {
      oauth.loadEnv();
      const token = await oauth.getValidAccessToken();
      console.log("✓ Token is valid or was refreshed");
      console.log(`Access token: ${token.substring(0, 10)}...`);
    } catch (error) {
      console.error("✗ Token refresh failed:", error.message);
      process.exit(1);
    }
  } else {
    console.log("Lightspeed X-Series OAuth Helper\n");
    console.log("Usage:");
    console.log("  node oauth.js authorize   - Complete OAuth setup and get initial token");
    console.log("  node oauth.js refresh     - Refresh existing token");
    console.log("\nCommands:");
    console.log("  Authorize first: node oauth.js authorize");
    console.log("  Upload codes:   node upload-codes.js --file <csv> --promotion <id>");
  }

  rl.close();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

const { authorize } = require("./commands/authorize");
const { refresh } = require("./commands/refresh");
const { generate } = require("./commands/generate");
const { upload } = require("./commands/upload");

const commands = {
  authorize,
  auth: authorize,
  refresh,
  generate,
  gen: generate,
  upload,
  up: upload
};

/**
 * Main CLI entry point
 */
function main() {
  const command = process.argv[2];

  if (!command) {
    printHelp();
    process.exit(0);
  }

  const handler = commands[command];

  if (!handler) {
    console.error(`✗ Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  try {
    const result = handler();
    if (result && typeof result.catch === "function") {
      result.catch((error) => {
        console.error("Fatal error:", error.message);
        process.exit(1);
      });
    }
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Lightspeed X-Series Promo Code Uploader

Usage:
  npx promo-uploader <command> [options]

Commands:
  authorize, auth      Complete OAuth setup and get initial token
  refresh              Refresh expired access token
  generate, gen        Generate random promo codes
  upload, up           Upload promo codes to Lightspeed promotion

Generate Options:
  --count N            Number of codes to generate (default: 1000)
  --length N           Code length after prefix (default: 8)
  --prefix STR         Code prefix (default: BABJUNE-)
  --charset STR        Characters to use (default: ABCDEFGHJKLMNPQRSTUVWXYZ23456789)
  --out FILE           Output CSV file (default: csv/promo-codes.csv)

Upload Options:
  --file FILE          Input CSV file (default: june-member-codes.csv)
  --promotion ID       Promotion ID (or set LS_PROMOTION_ID in .env)
  --batchSize N        Codes per API call (default: 250)
  --maxRedemptions N   Max redemptions per code (default: 1)
  --dryRun             Preview payload without uploading

Examples:
  # Setup OAuth
  npx promo-uploader authorize

  # Generate 5000 codes
  npx promo-uploader generate --count 5000 --prefix SUMMER-

  # Upload codes
  npx promo-uploader upload --file codes.csv --promotion abc123

  # Dry run
  npx promo-uploader upload --file codes.csv --promotion abc123 --dryRun

Configuration:
  Create a .env file with OAuth credentials:
    LS_CLIENT_ID=your_client_id
    LS_CLIENT_SECRET=your_client_secret
    LS_REDIRECT_URI=http://localhost:3000/callback
    LS_PROMOTION_ID=your_promotion_id

Documentation:
  https://developers.retail.lightspeed.app/docs/authorization
`);
}

module.exports = { main };

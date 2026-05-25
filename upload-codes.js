const fs = require("fs");
const oauth = require("./oauth");

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

function parseArgs() {
  const args = {};

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = process.argv[i + 1];

      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function readCodesFromCsv(file) {
  const raw = fs.readFileSync(file, "utf8").trim();

  if (!raw) {
    throw new Error(`CSV file is empty: ${file}`);
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0].split(",").map((column) => column.trim().toLowerCase());

  let codeIndex = header.indexOf("promo_code");

  if (codeIndex === -1) {
    codeIndex = header.indexOf("code");
  }

  if (codeIndex === -1) {
    throw new Error("CSV must contain a promo_code or code column");
  }

  const codes = [];

  for (const line of lines.slice(1)) {
    const columns = line.split(",");
    const code = String(columns[codeIndex] || "").trim().toUpperCase();

    if (code) {
      codes.push(code);
    }
  }

  const uniqueCodes = Array.from(new Set(codes));

  if (uniqueCodes.length !== codes.length) {
    console.warn(
      `Warning: removed ${codes.length - uniqueCodes.length} duplicate code(s) from input CSV`
    );
  }

  return uniqueCodes;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks;
}

function removeReadOnlyPromotionFields(promotion) {
  const copy = JSON.parse(JSON.stringify(promotion));

  // Avoid sending read-only or summary fields back during PUT.
  delete copy.id;
  delete copy.promo_code_summary;
  delete copy.version;
  delete copy.created_at;
  delete copy.updated_at;

  return copy;
}

function makePromoCodeObject(code, maxRedemptions) {
  const codeField = process.env.LS_PROMO_CODE_FIELD || "code";

  // The Lightspeed X-Series API uses 'limit' for redemption limit
  // See: https://x-series-api.lightspeedhq.com/reference/updatepromotion
  return {
    [codeField]: code,
    limit: maxRedemptions
  };
}

async function lightspeedRequest({ method, path, body, maxAttempts = 5 }) {
  const domainPrefix = process.env.LS_DOMAIN_PREFIX;
  const apiVersion = process.env.LS_API_VERSION || "2026-04";

  if (!domainPrefix) throw new Error("Missing LS_DOMAIN_PREFIX in .env");

  // Get valid access token (auto-refresh if needed)
  let accessToken;
  try {
    accessToken = await oauth.getValidAccessToken();
  } catch (error) {
    throw new Error(
      `Authentication failed: ${error.message}\n` +
      `Please complete OAuth setup first:\n` +
      `  node authenticate.js authorize`
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
      throw new Error(
        [
          `Lightspeed API error`,
          `Method: ${method}`,
          `URL: ${url}`,
          `Status: ${response.status}`,
          `Body: ${text}`
        ].join("\n")
      );
    }

    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts: ${method} ${path}`);
}

async function getPromotion(promotionId) {
  const response = await lightspeedRequest({
    method: "GET",
    path: `/promotions/${promotionId}`
  });
  // API wraps response in a "data" field
  return response.data || response;
}

async function updatePromotionWithCodes(promotionId, codes, maxRedemptions) {
  // Fetch the existing promotion to preserve all required fields
  const existingPromotion = await getPromotion(promotionId);

  // Build payload with all required fields from existing promotion
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

  // The Promotions guide references set_promo_code for adding promo codes.
  // If Lightspeed rejects this field in your tenant/API version, set LS_INCLUDE_SET_PROMO_CODE=false.
  if (process.env.LS_INCLUDE_SET_PROMO_CODE !== "false") {
    payload.set_promo_code = true;
  }

  return lightspeedRequest({
    method: "PUT",
    path: `/promotions/${promotionId}`,
    body: payload
  });
}

async function main() {
  loadEnv();
  oauth.loadEnv(); // Ensure OAuth module also has env loaded

  const args = parseArgs();

  const promotionId = args.promotion || process.env.LS_PROMOTION_ID;
  let file = args.file || "june-member-codes.csv";
  // Prepend csv/ if file doesn't already have a path
  if (!file.includes("/")) {
    file = `csv/${file}`;
  }
  const batchSize = Number(args.batchSize || 250);
  const maxRedemptions = Number(args.maxRedemptions || 1);
  const dryRun = Boolean(args.dryRun);

  if (!promotionId) {
    throw new Error("Missing promotion ID. Add LS_PROMOTION_ID to .env or pass --promotion");
  }

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("--batchSize must be a positive number");
  }

  if (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0) {
    throw new Error("--maxRedemptions must be a positive number");
  }

  const codes = readCodesFromCsv(file);
  const batches = chunkArray(codes, batchSize);

  console.log(`Promotion ID: ${promotionId}`);
  console.log(`Codes loaded: ${codes.length}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Batches: ${batches.length}`);
  console.log(`Max redemptions per code: ${maxRedemptions}\n`);

  if (dryRun) {
    const existingPromotion = await getPromotion(promotionId);
    const samplePayload = {
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
      add_promo_code: batches[0].map((code) => makePromoCodeObject(code, maxRedemptions))
    };

    if (process.env.LS_INCLUDE_SET_PROMO_CODE !== "false") {
      samplePayload.set_promo_code = true;
    }

    fs.writeFileSync(
      "test/dry-run-promotion-upload-payload.json",
      JSON.stringify(samplePayload, null, 2),
      "utf8"
    );

    console.log("Dry run complete. Wrote test/dry-run-promotion-upload-payload.json");
    console.log("No codes were uploaded.");
    return;
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    console.log(`Uploading batch ${i + 1}/${batches.length} (${batch.length} codes)...`);

    await updatePromotionWithCodes(promotionId, batch, maxRedemptions);

    console.log(`Uploaded batch ${i + 1}/${batches.length}`);

    // Small delay to avoid hammering the API.
    await sleep(1000);
  }

  console.log("Upload complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
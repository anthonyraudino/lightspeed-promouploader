const fs = require("fs");
const { validateUploadArgs } = require("../../lib/config");
const api = require("../../lib/lightspeed-api");
const { readCodesFromCsv } = require("../../lib/csv");
const { parseArgs } = require("../../utils/parse-args");
const { loadEnv } = require("../../utils/env");

/**
 * Upload promo codes to Lightspeed promotion
 */
async function upload() {
  try {
    loadEnv();
    const args = parseArgs();
    const config = validateUploadArgs(args);

    const codes = readCodesFromCsv(config.file);
    const batches = api.chunkArray(codes, config.batchSize);

    console.log(`\nPromotion ID: ${config.promotionId}`);
    console.log(`Codes loaded: ${codes.length}`);
    console.log(`Batch size: ${config.batchSize}`);
    console.log(`Batches: ${batches.length}`);
    console.log(`Max redemptions per code: ${config.maxRedemptions}\n`);

    if (config.dryRun) {
      const existingPromotion = await api.getPromotion(config.promotionId);
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
        add_promo_code: batches[0].map((code) => api.makePromoCodeObject(code, config.maxRedemptions))
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

      await api.updatePromotionWithCodes(config.promotionId, batch, config.maxRedemptions);

      console.log(`✓ Uploaded batch ${i + 1}/${batches.length}`);

      // Small delay to avoid hammering the API
      if (i < batches.length - 1) {
        await api.sleep(1000);
      }
    }

    console.log("\n✓ Upload complete!");
  } catch (error) {
    console.error("✗ Upload failed:", error.message);
    process.exit(1);
  }
}

module.exports = { upload };

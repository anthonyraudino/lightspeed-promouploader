const fs = require("fs");
const crypto = require("crypto");
const { validateGenerateArgs } = require("../../lib/config");
const { writeCodesToCsv } = require("../../lib/csv");
const { parseArgs } = require("../../utils/parse-args");

/**
 * Generate random promo codes
 */
function generate() {
  try {
    const args = parseArgs();
    const config = validateGenerateArgs(args);

    console.log(`\nGenerating ${config.count} promo codes...`);
    console.log(`Prefix: ${config.prefix}`);
    console.log(`Length: ${config.length}`);
    console.log(`Charset: ${config.charset}`);

    function randomCode(length, charset) {
      let code = "";
      for (let i = 0; i < length; i++) {
        const index = crypto.randomInt(0, charset.length);
        code += charset[index];
      }
      return code;
    }

    const codes = new Set();

    while (codes.size < config.count) {
      const code = `${config.prefix}${randomCode(config.length, config.charset)}`;
      codes.add(code);
    }

    writeCodesToCsv(config.out, Array.from(codes));

    console.log(`\n✓ Generated ${codes.size} unique codes`);
    console.log(`Output: ${config.out}`);

    const samples = Array.from(codes).slice(0, 5);
    console.log(`Examples: ${samples.join(", ")}`);
  } catch (error) {
    console.error("✗ Code generation failed:", error.message);
    process.exit(1);
  }
}

module.exports = { generate };

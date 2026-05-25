const fs = require("fs");
const { ValidationError } = require("../utils/errors");

/**
 * Read promo codes from CSV file
 * Expects a column named "promo_code" or "code"
 * @param {string} file - Path to CSV file
 * @returns {string[]} Array of unique promo codes
 */
function readCodesFromCsv(file) {
  const raw = fs.readFileSync(file, "utf8").trim();

  if (!raw) {
    throw new ValidationError("CSV file is empty", "file");
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = lines[0].split(",").map((column) => column.trim().toLowerCase());

  let codeIndex = header.indexOf("promo_code");

  if (codeIndex === -1) {
    codeIndex = header.indexOf("code");
  }

  if (codeIndex === -1) {
    throw new ValidationError("CSV must contain a 'promo_code' or 'code' column", "file");
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
    const duplicates = codes.length - uniqueCodes.length;
    console.warn(`Warning: removed ${duplicates} duplicate code(s) from input CSV`);
  }

  return uniqueCodes;
}

/**
 * Write promo codes to CSV file
 * @param {string} file - Output file path
 * @param {string[]} codes - Array of promo codes
 */
function writeCodesToCsv(file, codes) {
  const rows = ["promo_code", ...codes];
  fs.writeFileSync(file, rows.join("\n"), "utf8");
}

module.exports = {
  readCodesFromCsv,
  writeCodesToCsv
};

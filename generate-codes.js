const fs = require("fs");
const crypto = require("crypto");

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

function randomCode(length, charset) {
  let code = "";

  for (let i = 0; i < length; i++) {
    const index = crypto.randomInt(0, charset.length);
    code += charset[index];
  }

  return code;
}

function main() {
  const args = parseArgs();

  const count = Number(args.count || 1000);
  const length = Number(args.length || 8);
  const prefix = String(args.prefix || "BABJUNE-").toUpperCase();
  const out = String(args.out || "csv/promo-codes.csv");

  // Avoid ambiguous chars like O/0 and I/1.
  // 32 chars ^ 8 = ~1.1 trillion possible values before prefix.
  const charset = String(
    args.charset || "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  ).toUpperCase();

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("--count must be a positive number");
  }

  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("--length must be a positive number");
  }

  if (!charset.length) {
    throw new Error("Charset cannot be empty");
  }

  const codes = new Set();

  while (codes.size < count) {
    const code = `${prefix}${randomCode(length, charset)}`;
    codes.add(code);
  }

  const rows = ["promo_code"];
  for (const code of codes) {
    rows.push(code);
  }

  fs.writeFileSync(out, rows.join("\n"), "utf8");

  console.log(`Generated ${codes.size} unique codes`);
  console.log(`Output: ${out}`);
  console.log(`Example: ${Array.from(codes).slice(0, 5).join(", ")}`);
}

main();
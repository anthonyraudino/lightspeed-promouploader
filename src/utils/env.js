const fs = require("fs");

/**
 * Load environment variables from .env file
 * Does not override existing process.env variables
 * @param {string} file - Path to .env file (default: .env)
 */
function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) {
    return;
  }

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value.replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Save key-value pairs to .env file
 * Updates existing keys, preserves unrelated entries
 * @param {Object} updates - Key-value pairs to save
 * @param {string} file - Path to .env file (default: .env)
 */
function saveEnv(updates, file = ".env") {
  let content = "";
  if (fs.existsSync(file)) {
    content = fs.readFileSync(file, "utf8");
  }

  // Parse existing content into a map
  const envMap = new Map();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex !== -1) {
      const key = trimmed.slice(0, equalsIndex).trim();
      envMap.set(key, trimmed);
    }
  }

  // Update with new values
  for (const [key, value] of Object.entries(updates)) {
    envMap.set(key, `${key}="${value}"`);
  }

  // Reconstruct file
  const newLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex !== -1) {
        const key = trimmed.slice(0, equalsIndex).trim();
        continue; // Skip, will be added from map
      }
    }
    // Keep comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) {
      newLines.push(line);
    }
  }

  // Add all env vars
  for (const value of envMap.values()) {
    newLines.push(value);
  }

  fs.writeFileSync(file, newLines.join("\n").trim() + "\n", "utf8");
}

module.exports = {
  loadEnv,
  saveEnv
};

/**
 * Simple logger with levels: debug, info, warn, error
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLevel = LOG_LEVELS.info;

function setLevel(level) {
  if (typeof level === "string") {
    currentLevel = LOG_LEVELS[level.toLowerCase()] ?? LOG_LEVELS.info;
  } else {
    currentLevel = level;
  }
}

function log(level, message, data = null) {
  const levelNum = LOG_LEVELS[level] ?? LOG_LEVELS.info;

  if (levelNum < currentLevel) {
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = {
    debug: "🔍 DEBUG",
    info: "ℹ️  INFO",
    warn: "⚠️  WARN",
    error: "❌ ERROR"
  }[level] || level.toUpperCase();

  console.log(`${prefix}: ${message}`);

  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

function debug(message, data) {
  log("debug", message, data);
}

function info(message, data) {
  log("info", message, data);
}

function warn(message, data) {
  log("warn", message, data);
}

function error(message, data) {
  log("error", message, data);
}

module.exports = {
  setLevel,
  debug,
  info,
  warn,
  error
};

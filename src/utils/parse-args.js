/**
 * Parse command-line arguments
 * @param {string[]} argv - Arguments array (defaults to process.argv.slice(2))
 * @returns {Object} Parsed arguments
 */
function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];

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

module.exports = { parseArgs };

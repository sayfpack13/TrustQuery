// === backend/parser.js ===
const readline = require("readline");
const { createReadStream } = require("fs");

exports.countLines = async function (filePath, progressCallback = () => {}) {
  let lineCount = 0;
  const readStream = createReadStream(filePath);
  const rl = readline.createInterface({
    input: readStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lineCount++;
    progressCallback(lineCount);
  }
  return lineCount;
};

// New signature for parseFile: takes an onBatch callback and a batchSize
exports.parseFile = async function (filePath, onBatch, batchSize = 1000, progressCallback = () => {}) {
  const readStream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: readStream });

  let currentBatch = [];
  let totalProcessedLines = 0; // Renamed for clarity as we're now just processing lines

  for await (const line of rl) {
    totalProcessedLines++;
    let clean = line.trim();

    // Basic validation: ensure line is not empty and contains 'http' to be considered valid
    if (!clean) {
      progressCallback(totalProcessedLines);
      continue;
    }

    currentBatch.push({ raw_line: clean }); // Store the raw, cleaned line

    // If the batch is full, process it
    if (currentBatch.length >= batchSize) {
      await onBatch(currentBatch);
      currentBatch = [];
    }
    progressCallback(totalProcessedLines);
  }

  // Process any remaining lines in the last batch
  if (currentBatch.length > 0) {
    await onBatch(currentBatch);
  }

  return totalProcessedLines; // Return total lines processed (including skipped ones for consistency)
};
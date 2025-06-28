const readline = require("readline");
const { createReadStream, promises: fsPromises } = require("fs");


exports.countLines = async function (filePath, progressCallback = () => {}) {
  let lineCount = 0;
  const CHUNK_SIZE = 64 * 1024; // 64 KB
  const buffer = Buffer.alloc(CHUNK_SIZE);
  let bytesRead;
  let fileHandle;

  try {
    fileHandle = await fsPromises.open(filePath, 'r');
    let position = 0;

    while ((bytesRead = await fileHandle.read(buffer, 0, CHUNK_SIZE, position)).bytesRead > 0) {
      for (let i = 0; i < bytesRead.bytesRead; i++) {
        if (buffer[i] === 10) {
          lineCount++;
        }
      }
      position += bytesRead.bytesRead;
      progressCallback(lineCount);
    }


    if (lineCount === 0 && position > 0) {
        lineCount = 1;
    }

    return lineCount;

  } catch (error) {
    throw error;
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
};




exports.parseFile = async function (filePath, onBatch, batchSize = 1000,  progressCallback = () => {}) {
  return new Promise((resolve, reject) => {
    const readStream = createReadStream(filePath, { encoding: "utf-8" });
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
      maxLineLength:  1024 * 1024,
    });

    let currentBatch = [];
    let totalProcessedLines = 0;

    rl.on('line', (line) => {
      totalProcessedLines++;
      const cleanLine = line.trim();

      // Skip lines that contain spaces after trimming leading/trailing whitespace.
      if (cleanLine.includes(' ') && cleanLine.length > 0) {
        return; // Skip this line
      }

      currentBatch.push(line);
      progressCallback(totalProcessedLines);

      if (currentBatch.length >= batchSize) {
        onBatch(currentBatch);
        currentBatch = [];
      }
    });

    rl.on('close', () => {
      // Process any remaining lines in the last batch
      if (currentBatch.length > 0) {
        onBatch(currentBatch);
      }
      resolve();
    });

    rl.on('error', (err) => {
      // This will catch the 'ERR_BUFFER_TOO_LARGE' error when a line exceeds maxLineLength.
      if (err.code === 'ERR_BUFFER_TOO_LARGE') {

      } else {
        // If it's a different error, reject the promise.
        reject(err);
      }
    });
  });
};
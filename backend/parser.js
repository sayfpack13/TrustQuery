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



exports.parseFile = async function (
  filePath,
  onBatch,
  batchSize = 1000,
  progressCallback = () => {}
) {
  return new Promise((resolve, reject) => {
    let buffer = ""; // Use 'let' to allow reassignment.
    let currentBatch = [];
    let totalProcessedLines = 0;
    let readStream;

    try {
      readStream = createReadStream(filePath, { encoding: "utf8" });
    } catch (error) {
      return reject(error);
    }

    readStream.on("data", (chunk) => {
      // Append the new chunk to the buffer.
      buffer += chunk;
      // Split the buffer by newlines. The last element might be an incomplete line.
      const lines = buffer.split("\n");
      // Keep the last part of the buffer (which may not be a complete line) for the next chunk.
      buffer = lines.pop();

      for (const line of lines) {
        // Increment the total processed lines counter for each complete line.
        totalProcessedLines++;
        
        const cleanLine = line.trim();

        // Skip lines that contain spaces after trimming leading/trailing whitespace.
        if (cleanLine.includes(' ') && cleanLine.length > 0) {
          continue;
        }

        // You can set a maximum length for the lines you process
        const MAX_LINE_LENGTH = 1024 * 1024; // 1 MB
        if (cleanLine.length > MAX_LINE_LENGTH) {
          console.warn(`Skipping a line with length ${cleanLine.length} as it exceeds the maximum allowed length.`);
          continue;
        }

        currentBatch.push(line);
        progressCallback(totalProcessedLines);

        if (currentBatch.length >= batchSize) {
          onBatch(currentBatch);
          currentBatch = [];
        }
      }
    });

    readStream.on("end", () => {
      // Process any remaining line in the buffer after the stream ends.
      if (buffer.length > 0) {
        const remainingLines = buffer.split('\n');
        for (const line of remainingLines) {
          const cleanLine = line.trim();
          if (cleanLine.includes(' ') && cleanLine.length > 0) {
            continue;
          }
          currentBatch.push(line);
        }
      }

      // Process any remaining lines in the last batch.
      if (currentBatch.length > 0) {
        onBatch(currentBatch);
      }

      resolve(totalProcessedLines);
    });

    readStream.on("error", (error) => {
      reject(error);
    });
  });
};
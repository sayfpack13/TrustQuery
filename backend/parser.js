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
    let buffer = "";
    let currentBatch = [];
    let totalProcessedLines = 0;
    let readStream;
    const MAX_LINE_LENGTH = 10 * 1024 * 1024; // 10 MB

    try {
      readStream = createReadStream(filePath, { encoding: "utf8" });
    } catch (error) {
      return reject(error);
    }

    const processLine = (line) => {
        totalProcessedLines++;
        
        const cleanLine = line.trim();

        // Skip lines that contain spaces after trimming
        if (cleanLine.includes(' ') && cleanLine.length > 0) {
          return;
        }

        if (line.length > MAX_LINE_LENGTH) {
          //console.warn(`Skipping a line with length ${line.length} as it exceeds the maximum allowed length of ${MAX_LINE_LENGTH} bytes.`);
          return;
        }

        currentBatch.push(line);
        progressCallback(totalProcessedLines);

        if (currentBatch.length >= batchSize) {
          onBatch(currentBatch);
          currentBatch = [];
        }
    };

    readStream.on("data", (chunk) => {
      buffer += chunk;
      // Safety check to prevent heap exhaustion from a very long line without a newline.
      while (buffer.length > MAX_LINE_LENGTH && buffer.indexOf('\n') === -1) {
        // Skip the first MAX_LINE_LENGTH characters as one 'bad' line
        //console.warn(`Skipping a line exceeding ${MAX_LINE_LENGTH / (1024*1024)}MB without a newline.`);
        buffer = buffer.slice(MAX_LINE_LENGTH);
      }
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        processLine(line);
      }
    });

    readStream.on("end", () => {
      // Process any remaining data in the buffer as the last line.
      if (buffer.length > 0) {
        processLine(buffer);
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
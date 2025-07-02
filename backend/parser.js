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
    let isProcessingBatch = false; // Flag to manage backpressure

    try {
      readStream = createReadStream(filePath, { encoding: "utf8" });
    } catch (error) {
      return reject(error);
    }

    const processBatch = async () => {
        if (currentBatch.length === 0 || isProcessingBatch) {
            return;
        }
        isProcessingBatch = true; // Set flag to true to prevent re-entry

        try {
            await onBatch(currentBatch); // Await the batch processing
            currentBatch = []; // Clear batch only after successful processing
            isProcessingBatch = false; // Reset flag
            if (readStream.isPaused()) {
                readStream.resume(); // Resume if paused
            }
        } catch (error) {
            isProcessingBatch = false; // Reset flag
            readStream.destroy(error); // Destroy stream on error
        }
    };

    const processLine = (line) => {
        totalProcessedLines++;

        const cleanLine = line.trim();

        if (cleanLine.includes(' ') && cleanLine.length > 0) {
          return;
        }

        if (line.length > MAX_LINE_LENGTH) {
          return;
        }

        currentBatch.push(line);
        progressCallback(totalProcessedLines);

        if (currentBatch.length >= batchSize) {
            readStream.pause(); // Pause stream before processing batch
            processBatch(); // Process batch asynchronously
        }
    };

    readStream.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.length > MAX_LINE_LENGTH && buffer.indexOf('\n') === -1) {
        buffer = buffer.slice(MAX_LINE_LENGTH);
      }
      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);
        processLine(line);
      }
    });

    readStream.on("end", async () => { // Make end handler async
      if (buffer.length > 0) {
        processLine(buffer);
      }

      if (currentBatch.length > 0) {
        await processBatch(); // Ensure last batch is processed
      }

      resolve(totalProcessedLines);
    });

    readStream.on("error", (error) => {
      reject(error);
    });
  });
};
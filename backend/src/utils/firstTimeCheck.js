const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a file in the data directory to persist first-time status
const FIRST_RUN_FILE = path.join(__dirname, '../../data/.first_run');

function isFirstTimeUse() {
  try {





    return !fs.existsSync(FIRST_RUN_FILE);
  } catch (err) {
    // If error, assume not first time to avoid blocking
    return false;
  }
}

function markFirstRunComplete() {
  try {
    fs.writeFileSync(FIRST_RUN_FILE, `first_run_completed_at=${new Date().toISOString()}\nhostname=${os.hostname()}`);
  } catch (err) {
    // Ignore errors
  }
}

module.exports = { isFirstTimeUse, markFirstRunComplete };

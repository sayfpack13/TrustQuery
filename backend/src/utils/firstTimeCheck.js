const os = require('os');
const { getConfig, setConfig } = require('../config');

// Get the primary MAC address (first non-internal, non-empty MAC)
function getPrimaryMac() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return null;
}




async function isFirstTimeUse() {
  try {
    const mac = getPrimaryMac();
    if (!mac) {
      // If MAC not found, assume not first time (cannot reliably check)
      return false;
    }
    const config = getConfig();
    const completedMacs = config.firstRunCompletedMacs || [];
    return !completedMacs.includes(mac);
  } catch (err) {
    // If error, assume not first time to avoid blocking
    return false;
  }
}


async function markFirstRunComplete() {
  try {
    const mac = getPrimaryMac();
    if (mac) {
      const config = getConfig();
      let completedMacs = config.firstRunCompletedMacs || [];
      if (!completedMacs.includes(mac)) {
        completedMacs.push(mac);
        await setConfig('firstRunCompletedMacs', completedMacs);
      }
    }
  } catch (err) {
    // Ignore errors
  }
}

module.exports = { isFirstTimeUse, markFirstRunComplete };

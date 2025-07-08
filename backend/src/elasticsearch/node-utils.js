const net = require("net");
const { getConfig } = require("../config");

/**
 * Check if a node is running and ready (TCP port check)
 */
async function isNodeRunning(nodeName) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  if (!metadata) return false;
  const host = metadata.host || "localhost";
  const port = metadata.port || 9200;
  return isPortOpen(host, port, 1000);
}

/**
 * Check if a TCP port is open
 */
async function isPortOpen(host, port, timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isDone = false;
    socket.setTimeout(timeout);
    socket.once("connect", () => {
      isDone = true;
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      if (!isDone) {
        isDone = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.once("error", () => {
      if (!isDone) {
        isDone = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.connect(port, host);
  });
}

module.exports = {
  isNodeRunning,
  isPortOpen,
}; 
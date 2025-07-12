const net = require("net");
const { getConfig } = require("../config");

/**
 * Check if a node is running and ready (TCP port + HTTP check)
 * @param {string} nodeName
 * @param {object} [opts] - { fastMode: boolean } if true, only check port
 */
async function isNodeRunning(nodeName, opts = {}) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  if (!metadata) return false;
  let host = null;
  let port = null;
  if (metadata.host && metadata.port) {
    host = metadata.host;
    port = metadata.port;
  } else if (metadata.nodeUrl) {
    try {
      const urlObj = new URL(metadata.nodeUrl);
      host = urlObj.hostname;
      port = parseInt(urlObj.port) || 9200;
    } catch (e) {
      host = "localhost";
      port = 9200;
    }
  } else {
    host = "localhost";
    port = 9200;
  }
  // First, check if the port is open
  const portOpen = await isPortOpen(host, port, 300);
  if (!portOpen) return false;
  if (opts.fastMode) return true;
  // Next, check if the Elasticsearch HTTP endpoint responds (HEAD, short timeout)
  try {
    const url = `http://${host}:${port}/`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timeout);
    if (res.status === 200) {
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
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
const net = require("net");
const { getConfig } = require("../config");

/**
 * Check if a node is running and ready (TCP port + HTTP check)
 */
async function isNodeRunning(nodeName) {
  const nodeMetadata = getConfig("nodeMetadata") || {};
  const metadata = nodeMetadata[nodeName];
  if (!metadata) return false;
  // Always prefer host/port if available, else parse nodeUrl
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
  // Log the host/port being checked
  console.log(`[isNodeRunning] Checking node '${nodeName}' at ${host}:${port}`);
  // First, check if the port is open
  const portOpen = await isPortOpen(host, port, 1000);
  if (!portOpen) return false;
  // Next, check if the Elasticsearch HTTP endpoint responds
  try {
    const url = `http://${host}:${port}/`;
    const res = await fetch(url, { timeout: 1000 });
    if (res.status === 200) {
      const body = await res.json();
      if (body && body.version) {
        return true;
      }
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
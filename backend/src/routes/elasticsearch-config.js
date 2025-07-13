const express = require('express');
const router = express.Router();

const { getConfig } = require('../config');
const { verifyJwt } = require('../middleware/auth');



// Get only the Elasticsearch base path
router.get('/base-path', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    // Try to get a single base path property, or infer from configFilePath/dataPath/logsPath
    let basePath = '';
    if (config.elasticsearchConfig && config.elasticsearchConfig.basePath) {
      basePath = config.elasticsearchConfig.basePath;
    } else {
      // Try to infer from configFilePath, dataPath, or logsPath
      const esConfig = config.elasticsearchConfig || {};
      const pathsToCheck = [esConfig.configFilePath, esConfig.dataPath, esConfig.logsPath];
      for (const p of pathsToCheck) {
        if (typeof p === 'string' && p) {
          // Remove known subfolders (bin, config, data, logs, nodes, etc.)
          const match = p.match(/^(.*?)(\\|\/)(bin|config|data|logs|nodes)(\\|\/|$)/i);
          if (match) {
            basePath = match[1];
            break;
          } else {
            // Fallback: use parent directory
            basePath = require('path').dirname(p);
            break;
          }
        }
      }
    }
    res.json({ basePath });
  } catch (error) {
    console.error('Error getting Elasticsearch base path:', error);
    res.status(500).json({
      error: 'Failed to get Elasticsearch base path',
      details: error.message
    });
  }
});

module.exports = router;

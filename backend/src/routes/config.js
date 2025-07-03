// Configuration management routes
const express = require("express");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const { getES } = require("../elasticsearch/client");

const router = express.Router();

// GET current configuration
router.get("/", verifyJwt, (req, res) => {
  try {
    res.json(getConfig());
  } catch (error) {
    console.error("Error fetching configuration:", error);
    res.status(500).json({ error: "Failed to fetch configuration" });
  }
});

// POST update configuration
router.post("/", verifyJwt, async (req, res) => {
  try {
    const { searchIndices, minVisibleChars, maskingRatio, usernameMaskingRatio, batchSize, adminSettings, elasticsearchConfig } = req.body;

    const updates = {};
    if (searchIndices !== undefined) updates.searchIndices = searchIndices;
    if (minVisibleChars !== undefined) updates.minVisibleChars = minVisibleChars;
    if (maskingRatio !== undefined) updates.maskingRatio = maskingRatio;
    if (usernameMaskingRatio !== undefined) updates.usernameMaskingRatio = usernameMaskingRatio;
    if (batchSize !== undefined) updates.batchSize = batchSize;
    if (adminSettings !== undefined) updates.adminSettings = { ...getConfig('adminSettings'), ...adminSettings };
    if (elasticsearchConfig !== undefined) updates.elasticsearchConfig = { ...getConfig('elasticsearchConfig'), ...elasticsearchConfig };

    await setConfig(updates);

    res.json({
      message: "Configuration updated successfully",
      config: getConfig()
    });
  } catch (error) {
    console.error("Error updating configuration:", error);
    res.status(500).json({ error: "Failed to update configuration" });
  }
});

// POST update search indices
router.post("/search-indices", verifyJwt, async (req, res) => {
  try {
    const { indices } = req.body;
    const es = getES();

    if (!Array.isArray(indices)) {
      return res.status(400).json({ error: "Indices must be an array" });
    }

    // Verify all indices exist
    const nonExistentIndices = [];
    for (const index of indices) {
      const exists = await es.indices.exists({ index });
      if (!exists) {
        nonExistentIndices.push(index);
      }
    }

    if (nonExistentIndices.length > 0) {
      return res.status(400).json({ 
        error: `The following indices do not exist: ${nonExistentIndices.join(', ')}. Please refresh the page to see current indices.` 
      });
    }

    await setConfig('searchIndices', indices);

    // If the currently selected index is not in the new search indices, update it
    const currentSelectedIndex = getConfig('selectedIndex');
    if (!indices.includes(currentSelectedIndex)) {
      if (indices.length > 0) {
        await setConfig('selectedIndex', indices[0]);
        console.log(`Updated selectedIndex to '${indices[0]}' as previous selection was not in search indices`);
      }
    }

    res.json({
      message: "Search indices updated successfully",
      searchIndices: getConfig('searchIndices'),
      selectedIndex: getConfig('selectedIndex')
    });
  } catch (error) {
    console.error("Error updating search indices:", error);
    res.status(500).json({ error: "Failed to update search indices" });
  }
});

module.exports = router;

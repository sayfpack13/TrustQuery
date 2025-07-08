const express = require("express");
const clusterInfoRouter = require("./cluster-info");
const clusterManagementRouter = require("./cluster-management");
const nodeManagementRouter = require("./node-management");
const indexManagementRouter = require("./index-management");

const router = express.Router();

// Mount all cluster-related routes
router.use("/cluster/info", clusterInfoRouter);
router.use("/cluster/management", clusterManagementRouter);
router.use("/cluster/nodes", nodeManagementRouter);
router.use("/cluster/indices", indexManagementRouter);

module.exports = router; 
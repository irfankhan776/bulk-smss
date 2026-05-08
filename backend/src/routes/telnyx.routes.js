const express = require("express");
const { listNumbers, balance } = require("../controllers/telnyx.controller");

const router = express.Router();

router.get("/numbers", listNumbers);
router.get("/balance", balance);
router.get("/config", (_req, res) => {
  res.json({
    defaultFromNumber: process.env.DEFAULT_FROM_NUMBER || process.env.TELNYX_PHONE_NUMBER || null,
  });
});

module.exports = { telnyxRouter: router };


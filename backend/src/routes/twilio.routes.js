const express = require("express");
const { listNumbers, balance } = require("../controllers/twilio.controller");

const router = express.Router();

router.get("/numbers", listNumbers);
router.get("/balance", balance);

module.exports = { twilioRouter: router };

const express = require("express");
const { sendMessage, listMessages } = require("../controllers/messages.controller");

const router = express.Router();

router.post("/send", sendMessage);
router.get("/", listMessages);

module.exports = { messagesRouter: router };


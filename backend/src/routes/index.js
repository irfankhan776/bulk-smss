const express = require("express");
const { messagesRouter } = require("./messages.routes");
const { contactsRouter } = require("./contacts.routes");
const { campaignsRouter } = require("./campaigns.routes");
const { conversationsRouter } = require("./conversations.routes");
const { twilioRouter } = require("./twilio.routes");

const router = express.Router();

router.use("/messages", messagesRouter);
router.use("/contacts", contactsRouter);
router.use("/campaigns", campaignsRouter);
router.use("/conversations", conversationsRouter);
router.use("/", twilioRouter); // /numbers and /balance

module.exports = { apiRouter: router };


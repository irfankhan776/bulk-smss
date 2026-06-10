const express = require("express");
const { messagesRouter } = require("./messages.routes");
const { contactsRouter } = require("./contacts.routes");
const { campaignsRouter } = require("./campaigns.routes");
const { conversationsRouter } = require("./conversations.routes");
const { telnyxRouter } = require("./telnyx.routes");
const { testRouter } = require("./test.routes");

const router = express.Router();

router.use("/messages", messagesRouter);
router.use("/contacts", contactsRouter);
router.use("/campaigns", campaignsRouter);
router.use("/conversations", conversationsRouter);
router.use("/", telnyxRouter); // /numbers and /balance
router.use("/test", testRouter); // /test/telnyx, /test/google-maps, /test/cloudflare, /test/all

module.exports = { apiRouter: router };


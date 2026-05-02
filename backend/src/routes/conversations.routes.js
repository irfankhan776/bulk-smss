const express = require("express");
const { listConversations, getConversationThread } = require("../controllers/conversations.controller");

const router = express.Router();

router.get("/", listConversations);
router.get("/:phone", getConversationThread);

module.exports = { conversationsRouter: router };


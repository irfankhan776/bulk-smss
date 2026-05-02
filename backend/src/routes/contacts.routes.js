const express = require("express");
const { createContact, listContacts, importContacts, updateContact } = require("../controllers/contacts.controller");

const router = express.Router();

router.post("/", createContact);
router.get("/", listContacts);
router.post("/import", importContacts);
router.patch("/:id", updateContact);

module.exports = { contactsRouter: router };


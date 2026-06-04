const express = require("express");
const {
  createCampaignWizard,
  validateCSVRaw,
  listCampaigns,
  getCampaign,
  getCampaignLeads,
  deleteCampaign,
} = require("../controllers/campaigns.controller");

const router = express.Router();

// Wizard flow (new)
router.post("/wizard", createCampaignWizard);
router.post("/validate-csv", validateCSVRaw);

// Legacy flow (keep for backwards compat)
router.get("/", listCampaigns);
router.get("/:id", getCampaign);
router.get("/:id/leads", getCampaignLeads);
router.delete("/:id", deleteCampaign);

module.exports = { campaignsRouter: router };


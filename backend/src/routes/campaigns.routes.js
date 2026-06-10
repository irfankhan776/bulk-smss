const express = require("express");
const {
  createCampaignWizard,
  validateCSVRaw,
  listCampaigns,
  getCampaign,
  getCampaignLeads,
  deleteCampaign,
  quickTest,
} = require("../controllers/campaigns.controller");

const router = express.Router();

// Wizard flow (new)
router.post("/wizard", createCampaignWizard);
router.post("/validate-csv", validateCSVRaw);
router.post("/quick-test", quickTest);

// Legacy flow (keep for backwards compat)
router.get("/", listCampaigns);
router.get("/:id", getCampaign);
router.get("/:id/leads", getCampaignLeads);
router.delete("/:id", deleteCampaign);

// Cloudflare health check (used by ApiStatus component)
router.get("/cloudflare/status", async (req, res) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    return res.json({ ok: false, message: "CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN not set" });
  }

  try {
    const axios = require("axios");
    const response = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
      {
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        timeout: 8000,
      }
    );
    if (response.data.success) {
      return res.json({ ok: true, message: `Connected — ${(response.data.result || []).length} project(s)` });
    }
    return res.json({ ok: false, message: "Cloudflare API returned an error" });
  } catch (e) {
    return res.json({ ok: false, message: e?.message || "Connection failed" });
  }
});

module.exports = { campaignsRouter: router };


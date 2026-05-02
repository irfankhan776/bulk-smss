const express = require("express");
const { createCampaign, listCampaigns, getCampaign, startCampaign, pauseCampaign } = require("../controllers/campaigns.controller");

const router = express.Router();

router.post("/", createCampaign);
router.get("/", listCampaigns);
router.get("/:id", getCampaign);
router.post("/:id/start", startCampaign);
router.post("/:id/pause", pauseCampaign);

module.exports = { campaignsRouter: router };


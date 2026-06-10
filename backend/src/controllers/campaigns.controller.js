const { prisma } = require("../prisma/client");
const { campaignQueue } = require("../jobs/campaign.queue");
const { validateCSV } = require("../services/csvValidator.service");
const { searchBusinesses } = require("../services/googleMaps.service");
const { generateAndDeploySite } = require("../services/siteGenerator.service");
const { sendSingleSMS } = require("../services/telnyx.service");
const { normalizePhone } = require("../services/googleMaps.service");

// --- CSV-only validation endpoint ---
async function validateCSVRaw(req, res, next) {
  try {
    const { csvRaw } = req.body || {};
    if (!csvRaw) return res.status(400).json({ error: "csvRaw is required" });

    const result = validateCSV(csvRaw);

    return res.json({
      valid: result.valid,
      errors: result.errors,
      rowCount: result.rows.length,
      preview: result.rows.slice(0, 5),
      headers: result.headers,
    });
  } catch (err) {
    next(err);
  }
}

// --- Wizard: create + launch campaign in one step ---
async function createCampaignWizard(req, res, next) {
  try {
    const {
      name,
      niche,
      template,
      source,
      outreachBody,
      delaySeconds,
      maxLeads,
      csvRaw,
      googleCity,
      googleApiKey,
    } = req.body || {};

    // --- Validation ---
    if (!name) return res.status(400).json({ error: "Campaign name is required" });
    if (!outreachBody) return res.status(400).json({ error: "Outreach message is required" });
    if (!source) return res.status(400).json({ error: "Source (google_maps or csv_upload) is required" });
    if (!outreachBody.includes("{SITE_URL}")) {
      return res.status(400).json({
        error: 'Outreach message must contain {SITE_URL} placeholder. Example: "Hi! Check out your site: {SITE_URL}"',
      });
    }

    if (source === "csv_upload") {
      if (!csvRaw) return res.status(400).json({ error: "csvRaw is required when source is csv_upload" });
      const csvResult = validateCSV(csvRaw);
      if (!csvResult.valid) {
        return res.status(400).json({
          error: "CSV validation failed",
          errors: csvResult.errors,
          rowCount: csvResult.rows.length,
        });
      }
    }

    if (source === "google_maps") {
      if (!googleCity) return res.status(400).json({ error: "googleCity is required when source is google_maps" });
      if (!googleApiKey) return res.status(400).json({ error: "googleApiKey is required when source is google_maps" });
    }

    // --- Save campaign ---
    const campaign = await prisma.campaign.create({
      data: {
        name: String(name),
        body: outreachBody,
        outreachBody: outreachBody,
        source: source,
        niche: niche || "barber",
        template: template || "barber",
        delaySeconds: parseInt(delaySeconds || "7", 10),
        maxLeads: parseInt(maxLeads || "50", 10),
        isLive: true,
        status: "running",
        csvRaw: source === "csv_upload" ? csvRaw : null,
        googleCity: source === "google_maps" ? googleCity : null,
        googleApiKey: source === "google_maps" ? googleApiKey : null,
      },
    });

    let leadsQueued = 0;

    if (source === "csv_upload") {
      // Pre-insert leads from validated CSV
      const csvResult = validateCSV(csvRaw);
      if (csvResult.rows.length > 0) {
        await prisma.campaignLead.createMany({
          data: csvResult.rows.map((row) => ({
            campaignId: campaign.id,
            businessName: row.businessName,
            city: row.city,
            phone: row.phone,
            status: "pending",
          })),
        });

        const leads = await prisma.campaignLead.findMany({
          where: { campaignId: campaign.id },
          select: { id: true, businessName: true, city: true, phone: true },
        });

        // Enqueue one job per lead
        for (const lead of leads) {
          if (!campaignQueue) continue;
          await campaignQueue.add(
            {
              campaignId: campaign.id,
              leadId: lead.id,
              businessName: lead.businessName,
              city: lead.city,
              phone: lead.phone,
              outreachBody,
              template: template || "barber",
              delaySeconds: parseInt(delaySeconds || "7", 10),
            },
            { jobId: `${campaign.id}-${lead.id}` }
          );
          leadsQueued++;
        }
      }

      // Update total count
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalCount: leadsQueued },
      });
    }

    if (source === "google_maps") {
      // Enqueue a single discovery job — the worker will search Google Maps,
      // find leads, and create a job per lead dynamically
      if (campaignQueue) {
        await campaignQueue.add(
          {
            campaignId: campaign.id,
            type: "google_discovery",
            niche: niche || "barber",
            city: googleCity,
            apiKey: googleApiKey,
            maxLeads: parseInt(maxLeads || "50", 10),
            outreachBody,
            template: template || "barber",
            delaySeconds: parseInt(delaySeconds || "7", 10),
          },
          { jobId: `${campaign.id}-discovery` }
        );
        leadsQueued = 0; // Unknown until discovery completes
      }

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalCount: 0 },
      });
    }

    return res.json({
      campaignId: campaign.id,
      leadsQueued,
      status: campaign.status,
    });
  } catch (err) {
    next(err);
  }
}

// --- Existing endpoints (keep for backwards compat) ---
async function listCampaigns(req, res, next) {
  try {
    const items = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

async function getCampaign(req, res, next) {
  try {
    const id = String(req.params.id);
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        campaignContacts: { include: { contact: true } },
        campaignLeads: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!campaign) return res.status(404).json({ error: "not found" });
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
}

async function getCampaignLeads(req, res, next) {
  try {
    const id = String(req.params.id);
    const { status } = req.query;
    const where = { campaignId: id };
    if (status) where.status = status;

    const leads = await prisma.campaignLead.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });
    res.json({ leads });
  } catch (err) {
    next(err);
  }
}

async function deleteCampaign(req, res, next) {
  try {
    const id = String(req.params.id);
    await prisma.campaign.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// --- Quick test: generate site + send one SMS without creating a campaign ---
async function quickTest(req, res, next) {
  try {
    const { businessName, city, phone, outreachBody } = req.body || {};
    if (!businessName || !city || !phone) {
      return res.status(400).json({ error: "businessName, city, and phone are required" });
    }

    // Step 1: Generate + deploy site
    const { siteUrl } = await generateAndDeploySite({
      businessName,
      city,
      phone,
      template: "barber",
    });

    // Step 2: Send test SMS
    const from = normalizePhone(process.env.DEFAULT_FROM_NUMBER || process.env.TELNYX_PHONE_NUMBER);
    const to = normalizePhone(phone);
    const body = outreachBody
      ? String(outreachBody)
          .replace(/\{SITE_URL\}/g, siteUrl)
          .replace(/\{BUSINESS_NAME\}/g, businessName)
      : `Hi ${businessName}, check out your site: ${siteUrl}`;

    await sendSingleSMS({ to, from, text: body });

    return res.json({ success: true, siteUrl, phone: to });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  validateCSVRaw,
  createCampaignWizard,
  listCampaigns,
  getCampaign,
  getCampaignLeads,
  deleteCampaign,
  quickTest,
};

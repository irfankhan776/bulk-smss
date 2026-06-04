require("dotenv").config();

const { campaignQueue } = require("./campaign.queue");
const { prisma } = require("../prisma/client");
const { sendSingleSMS } = require("../services/telnyx.service");
const { generateAndDeploySite } = require("../services/siteGenerator.service");
const { searchBusinesses } = require("../services/googleMaps.service");
const { normalizePhone } = require("../services/googleMaps.service");

if (!campaignQueue) {
  console.warn("[campaign.worker] Campaign queue not available (Redis not configured). Worker is DISABLED.");
  module.exports = {};
  return;
}

const INTER_JOB_DELAY_MS = 500; // delay between starting jobs (worker concurrency = 1 for sequential processing)

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getIOIfAvailable() {
  try {
    const { getIO } = require("../socket");
    return getIO();
  } catch {
    return null;
  }
}

async function emitLeadProgress(io, campaignId, leadId, status, data = {}) {
  if (!io) return;
  io.to(`campaign:${campaignId}`).emit("lead:progress", {
    leadId,
    campaignId,
    status,
    ...data,
  });
}

async function emitCampaignSummary(io, campaignId) {
  if (!io) return;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      sentCount: true,
      totalCount: true,
      failedCount: true,
      status: true,
    },
  });
  if (!campaign) return;
  io.to(`campaign:${campaignId}`).emit("campaign:progress", campaign);
}

function buildOutreachMessage(body, { businessName, siteUrl }) {
  return String(body)
    .replace(/\{SITE_URL\}/g, siteUrl || "")
    .replace(/\{BUSINESS_NAME\}/g, businessName || "");
}

// ──────────────────────────────────────────────
// CSV FLOW: Process a single lead
// ──────────────────────────────────────────────
async function processLead(job) {
  const io = await getIOIfAvailable();
  const { campaignId, leadId, businessName, city, phone, outreachBody, template, delaySeconds } = job.data;

  const lead = await prisma.campaignLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  // Status: processing
  await prisma.campaignLead.update({ where: { id: leadId }, data: { status: "processing" } });
  await emitLeadProgress(io, campaignId, leadId, "processing", { businessName, city });

  try {
    // Step 1: Generate + deploy site
    const { siteUrl } = await generateAndDeploySite({ businessName, city, template });
    await prisma.campaignLead.update({
      where: { id: leadId },
      data: { siteUrl, status: "site_deployed" },
    });
    await emitLeadProgress(io, campaignId, leadId, "site_deployed", { siteUrl });

    // Step 2: Wait for user-specified delay
    if (delaySeconds && delaySeconds > 0) {
      await sleep(delaySeconds * 1000);
    }

    // Step 3: Send outreach SMS with site URL
    const from = normalizePhone(process.env.DEFAULT_FROM_NUMBER || process.env.TELNYX_PHONE_NUMBER);
    const to = normalizePhone(phone);
    const messageBody = buildOutreachMessage(outreachBody, { businessName, siteUrl });

    await sendSingleSMS({ to, from, text: messageBody });

    // Step 4: Mark as sent
    await prisma.campaignLead.update({ where: { id: leadId }, data: { status: "sms_sent" } });
    await emitLeadProgress(io, campaignId, leadId, "sms_sent", { phone: to });

    // Step 5: Increment campaign counters
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });
    await emitCampaignSummary(io, campaignId);

    return { ok: true, leadId, siteUrl, phone: to };
  } catch (err) {
    await prisma.campaignLead.update({
      where: { id: leadId },
      data: { status: "failed", errorMessage: err?.message },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
    await emitLeadProgress(io, campaignId, leadId, "failed", { error: err?.message });
    await emitCampaignSummary(io, campaignId);
    throw err;
  }
}

// ──────────────────────────────────────────────
// GOOGLE MAPS FLOW: Discovery job
// ──────────────────────────────────────────────
async function processGoogleDiscovery(job) {
  const io = await getIOIfAvailable();
  const {
    campaignId,
    type,
    niche,
    city,
    apiKey,
    maxLeads,
    outreachBody,
    template,
    delaySeconds,
  } = job.data;

  console.log(`[campaign.worker] Starting Google discovery for campaign ${campaignId}: ${niche} in ${city}`);

  await emitLeadProgress(io, campaignId, null, "discovery_started", { niche, city });

  const discoveredLeads = await searchBusinesses(city, niche, apiKey, maxLeads);
  console.log(`[campaign.worker] Found ${discoveredLeads.length} leads (no-website businesses)`);

  await emitLeadProgress(io, campaignId, null, "discovery_complete", {
    found: discoveredLeads.length,
  });

  if (discoveredLeads.length === 0) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "completed" },
    });
    await emitCampaignSummary(io, campaignId);
    return { ok: true, leadsFound: 0 };
  }

  // Save leads to DB and enqueue processing jobs
  let savedCount = 0;
  for (const leadData of discoveredLeads) {
    // Check for duplicate phone within this campaign
    const existing = await prisma.campaignLead.findFirst({
      where: { campaignId, phone: leadData.phone },
    });
    if (existing) continue;

    const lead = await prisma.campaignLead.create({
      data: {
        campaignId,
        businessName: leadData.name,
        city: leadData.city,
        phone: leadData.phone,
        website: leadData.website || null,
        status: "pending",
      },
    });

    // Enqueue the processing job for this lead
    await campaignQueue.add(
      {
        campaignId,
        leadId: lead.id,
        businessName: lead.businessName,
        city: lead.city,
        phone: lead.phone,
        outreachBody,
        template,
        delaySeconds,
      },
      { jobId: `${campaignId}-${lead.id}` }
    );
    savedCount++;

    // Small delay between saves to avoid DB pressure
    await sleep(100);
  }

  // Update total count
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { totalCount: savedCount },
  });

  await emitLeadProgress(io, campaignId, null, "leads_enqueued", { count: savedCount });
  await emitCampaignSummary(io, campaignId);

  return { ok: true, leadsFound: savedCount };
}

// ──────────────────────────────────────────────
// WORKER SETUP
// ──────────────────────────────────────────────
campaignQueue.process(1, async (job) => {
  const { type } = job.data || {};

  if (type === "google_discovery") {
    return await processGoogleDiscovery(job);
  }

  // Default: CSV lead processing
  return await processLead(job);
});

campaignQueue.on("failed", async (job, err) => {
  const { campaignId, leadId } = job.data || {};
  const io = await getIOIfAvailable();

  console.error("[campaign.worker] Job failed:", { jobId: job?.id, campaignId, err: err?.message });

  if (!campaignId) return;

  if (leadId) {
    await prisma.campaignLead.update({
      where: { id: leadId },
      data: { status: "failed", errorMessage: err?.message },
    });
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
    await emitLeadProgress(io, campaignId, leadId, "failed", { error: err?.message });
  }

  await emitCampaignSummary(io, campaignId);
});

async function shutdown() {
  if (campaignQueue) await campaignQueue.close();
  await prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[campaign.worker] running — concurrency=1, sequential lead processing");

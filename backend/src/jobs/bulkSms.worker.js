require("dotenv").config();

const { bulkSmsQueue } = require("./bulkSms.queue");
const { prisma } = require("../prisma/client");
const { sendSingleSMS, getBalance } = require("../services/twilio.service");

const CONCURRENCY = 5;
const INTER_JOB_DELAY_MS = 200;

function renderTemplate(template, contact) {
  if (!template) return "";
  return String(template).replace(/\{name\}/g, contact?.name || "");
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getIoIfAvailable() {
  // Worker can run standalone (no server). In that case, skip emits.
  try {
    // eslint-disable-next-line global-require
    const { getIO } = require("../socket");
    return getIO();
  } catch {
    return null;
  }
}

async function emitCampaignProgress(io, campaignId) {
  if (!io) return;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, sentCount: true, totalCount: true, failedCount: true, deliveredCount: true, status: true },
  });
  if (!campaign) return;
  io.emit("campaign:progress", {
    campaignId: campaign.id,
    sentCount: campaign.sentCount,
    total: campaign.totalCount,
    failedCount: campaign.failedCount,
    deliveredCount: campaign.deliveredCount,
    status: campaign.status,
  });
}

bulkSmsQueue.process(CONCURRENCY, async (job) => {
  const io = await getIoIfAvailable();
  const { campaignId, contactId, to, from, body, messageId } = job.data || {};

  if (!campaignId || !contactId || !to || !from || !body || !messageId) {
    throw new Error("Invalid job payload (campaignId, contactId, to, from, body, messageId required)");
  }

  // Delay between jobs (rate limit safety)
  await sleep(INTER_JOB_DELAY_MS);

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  const personalizedBody = renderTemplate(body, contact);

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) throw new Error("Missing queued message record for campaign send");

  const { providerMessageId } = await sendSingleSMS({ to, from, text: personalizedBody });

  await prisma.$transaction(async (tx) => {
    await tx.message.update({
      where: { id: messageId },
      data: { providerMessageId, status: "sent", body: personalizedBody },
    });

    await tx.campaignContact.update({
      where: { campaignId_contactId: { campaignId, contactId } },
      data: { status: "sent", sentAt: new Date() },
    });

    await tx.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });
  });

  await emitCampaignProgress(io, campaignId);

  if (io) {
    try {
      const bal = await getBalance();
      io.emit("balance:update", bal);
    } catch (err) {
      console.error("[worker] balance update failed", { err: err?.message, code: err?.code });
    }
  }

  return { ok: true };
});

bulkSmsQueue.on("failed", async (job, err) => {
  const attemptsMade = job?.attemptsMade ?? 0;
  const maxAttempts = job?.opts?.attempts ?? 3;
  const io = await getIoIfAvailable();

  console.error("[bulk-sms] job failed", { id: job?.id, attemptsMade, maxAttempts, err: err?.message });

  if (!job?.data?.campaignId || !job?.data?.contactId || !job?.data?.messageId) return;
  const { campaignId, contactId, messageId } = job.data;

  // Only mark failed after final retry
  if (attemptsMade < maxAttempts) return;

  await prisma.$transaction(async (tx) => {
    await tx.message.update({ where: { id: messageId }, data: { status: "failed" } });

    await tx.campaignContact.update({
      where: { campaignId_contactId: { campaignId, contactId } },
      data: { status: "failed" },
    });

    await tx.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
  });

  await emitCampaignProgress(io, campaignId);
});

async function shutdown() {
  await bulkSmsQueue.close();
  await prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[bulk-sms.worker] running", { concurrency: CONCURRENCY, delayMs: INTER_JOB_DELAY_MS });


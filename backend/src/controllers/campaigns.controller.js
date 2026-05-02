const { prisma } = require("../prisma/client");
const { bulkSmsQueue } = require("../jobs/bulkSms.queue");

function normalizePhone(p) {
  if (!p) return null;
  return String(p).trim();
}

async function createCampaign(req, res, next) {
  try {
    const { name, body, contactIds } = req.body || {};
    if (!name || !body) return res.status(400).json({ error: "name and body are required" });

    const ids = Array.isArray(contactIds) ? contactIds.map(String) : [];

    const campaign = await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: { name: String(name), body: String(body), status: "draft", totalCount: ids.length },
      });

      if (ids.length) {
        await tx.campaignContact.createMany({
          data: ids.map((contactId) => ({ campaignId: c.id, contactId, status: "pending" })),
          skipDuplicates: true,
        });
      }

      return c;
    });

    res.json({ campaignId: campaign.id });
  } catch (err) {
    next(err);
  }
}

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
        campaignContacts: {
          include: { contact: true },
          orderBy: { status: "asc" },
        },
      },
    });
    if (!campaign) return res.status(404).json({ error: "not found" });
    res.json({ campaign });
  } catch (err) {
    next(err);
  }
}

async function startCampaign(req, res, next) {
  try {
    const id = String(req.params.id);
    const { fromNumber, scheduleAt } = req.body || {};
    const from = normalizePhone(fromNumber) || normalizePhone(process.env.DEFAULT_FROM_NUMBER);
    if (!from) return res.status(400).json({ error: "fromNumber is required (or set DEFAULT_FROM_NUMBER)" });

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { campaignContacts: { include: { contact: true } } },
    });
    if (!campaign) return res.status(404).json({ error: "not found" });

    const scheduledAt = scheduleAt ? new Date(scheduleAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ error: "invalid scheduleAt" });

    const startAt = scheduledAt ? scheduledAt.getTime() : Date.now();
    const delayBase = Math.max(0, startAt - Date.now());

    // Ensure totals are accurate
    const totalCount = campaign.campaignContacts.length;
    await prisma.campaign.update({
      where: { id },
      data: { status: "running", scheduledAt: scheduledAt || null, totalCount },
    });

    // For each contact: create queued message record (never drop), enqueue job with incremental delay (200ms)
    let i = 0;
    for (const cc of campaign.campaignContacts) {
      const to = cc.contact.phone;
      const message = await prisma.message.create({
        data: {
          direction: "OUTBOUND",
          status: "queued",
          body: campaign.body,
          fromNumber: from,
          toNumber: to,
          contactId: cc.contactId,
          campaignId: id,
        },
      });

      await bulkSmsQueue.add(
        {
          campaignId: id,
          contactId: cc.contactId,
          to,
          from,
          body: campaign.body,
          messageId: message.id,
        },
        { delay: delayBase + i * 200 }
      );
      i += 1;
    }

    res.json({ ok: true, enqueued: totalCount, scheduledAt: scheduledAt || null });
  } catch (err) {
    next(err);
  }
}

async function pauseCampaign(req, res, next) {
  try {
    await bulkSmsQueue.pause(true);
    const id = String(req.params.id);
    await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { createCampaign, listCampaigns, getCampaign, startCampaign, pauseCampaign };


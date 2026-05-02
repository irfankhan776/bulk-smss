const { prisma } = require("../prisma/client");
const { sendOutboundMessage } = require("../services/sms.service");
const { getIO } = require("../socket");

async function sendMessage(req, res, next) {
  try {
    const { to, from, text, body, campaignId } = req.body || {};
    const content = body ?? text;
    const msg = await sendOutboundMessage({ to, from, body: content, campaignId: campaignId || null });

    // emit to conversation room for real-time thread update
    try {
      const io = getIO();
      io.emit("message:received", msg); // outbound message should appear in UI stream too
      io.to(`conversation:${msg.contact.phone}`).emit("message:received", msg);
    } catch {}

    res.json({ message: msg });
  } catch (err) {
    next(err);
  }
}

async function listMessages(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || "50", 10)));
    const contactId = req.query.contactId ? String(req.query.contactId) : null;
    const campaignId = req.query.campaignId ? String(req.query.campaignId) : null;

    const where = {};
    if (contactId) where.contactId = contactId;
    if (campaignId) where.campaignId = campaignId;

    const [items, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: { contact: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      items,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendMessage, listMessages };


const { prisma } = require("../prisma/client");

async function listConversations(req, res, next) {
  try {
    // Grouped by contact phone, sorted by latest message desc.
    // Using DISTINCT ON for efficient latest-per-contact retrieval.
    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON (c.phone)
        c.id as "contactId",
        c.phone as "phone",
        c.name as "name",
        c.tags as "tags",
        m.id as "messageId",
        m.body as "body",
        m.direction as "direction",
        m.status as "status",
        m."fromNumber" as "fromNumber",
        m."toNumber" as "toNumber",
        m."createdAt" as "createdAt"
      FROM "Message" m
      JOIN "Contact" c ON c.id = m."contactId"
      ORDER BY c.phone, m."createdAt" DESC;
    `;

    // sort globally by createdAt desc
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ items: rows });
  } catch (err) {
    next(err);
  }
}

async function getConversationThread(req, res, next) {
  try {
    const phone = String(req.params.phone || "").trim();
    if (!phone) return res.status(400).json({ error: "phone required" });

    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (!contact) return res.json({ contact: null, messages: [] });

    const messages = await prisma.message.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "asc" },
    });

    res.json({ contact, messages });
  } catch (err) {
    next(err);
  }
}

module.exports = { listConversations, getConversationThread };


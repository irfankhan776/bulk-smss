const { prisma } = require("../prisma/client");
const { sendSingleSMS } = require("./telnyx.service");

function normalizePhone(p) {
  if (!p) return null;
  // Remove all characters except digits and plus sign
  let s = String(p).replace(/[^\d+]/g, '');
  
  // If the number consists only of digits (no +), prepend +
  if (/^\d+$/.test(s)) {
    s = '+' + s;
  }
  return s;
}

async function sendOutboundMessage({ to, from, body, campaignId = null }) {
  const toNumber = normalizePhone(to);
  const fromNumber = normalizePhone(from);
  if (!toNumber || !fromNumber || !body) {
    const err = new Error("to, from, body are required");
    err.statusCode = 400;
    throw err;
  }

  // Ensure contact exists
  const contact = await prisma.contact.upsert({
    where: { phone: toNumber },
    create: { phone: toNumber },
    update: {},
  });

  // Create message as queued first (never drop)
  const message = await prisma.message.create({
    data: {
      direction: "OUTBOUND",
      body,
      status: "queued",
      fromNumber,
      toNumber,
      contactId: contact.id,
      campaignId,
    },
  });

  try {
    const { providerMessageId, status } = await sendSingleSMS({ to: toNumber, from: fromNumber, text: body });

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { providerMessageId, status: status === "failed" ? "failed" : "sent" },
      include: { contact: true },
    });
    return updated;
  } catch (err) {
    console.error("[sms.service] send failed", { messageId: message.id, err: err?.message, code: err?.code });
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "failed", errorMessage: err?.message || "Unknown error" },
    });
    throw err;
  }
}

module.exports = { sendOutboundMessage, normalizePhone };


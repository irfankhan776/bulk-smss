const express = require("express");
const { prisma } = require("../prisma/client");
const { validateWebhookSignature, TwilioError } = require("../services/twilio.service");
const { getIO } = require("../socket");

const router = express.Router();

function safeString(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function parseMessageFields(body) {
  const from = body?.From || body?.from || "";
  const to = body?.To || body?.to || "";
  const text = body?.Body || body?.body || body?.Text || "";
  const providerMessageId = body?.MessageSid || body?.messageSid || body?.SmsSid || "";
  const messageStatus = body?.MessageStatus || body?.messageStatus || body?.SmsStatus || "";
  const errorCode = body?.ErrorCode || body?.errorCode || "";
  const errorMessage = body?.ErrorMessage || body?.errorMessage || "";
  const accountSid = body?.AccountSid || "";

  return {
    from: safeString(from).trim(),
    to: safeString(to).trim(),
    text: safeString(text),
    providerMessageId,
    messageStatus,
    errorCode,
    errorMessage,
    accountSid,
  };
}

async function markProcessed(providerEventId) {
  await prisma.webhookEvent.update({
    where: { providerEventId },
    data: { processed: true },
  });
}

// Twilio sends webhooks as URL-encoded form data
router.post("/twilio", express.urlencoded({ extended: false }), async (req, res) => {
  const signature = req.get("X-Twilio-Signature") || "";
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const body = typeof req.body === "object" ? req.body : {};

  // Validate webhook signature
  try {
    validateWebhookSignature(url, body, signature);
  } catch (err) {
    console.error("[webhook] signature invalid", { err: err?.message, code: err?.code });
    return res.status(403).json({ error: "invalid signature" });
  }

  const { providerMessageId, messageStatus, from, to, text, errorCode, errorMessage } = parseMessageFields(body);

  // Build a unique event ID from Twilio MessageSid + status (same SID can have multiple status updates)
  const providerEventId = providerMessageId
    ? `${providerMessageId}:${messageStatus || "received"}`
    : null;

  if (!providerEventId) {
    console.error("[webhook] missing event metadata", { providerMessageId, messageStatus });
    return res.status(400).json({ error: "bad event" });
  }

  // Idempotency guard
  const existing = await prisma.webhookEvent.findUnique({ where: { providerEventId }, select: { id: true } });
  if (existing) return res.status(200).json({ ok: true, deduped: true });

  // Store raw event immediately
  await prisma.webhookEvent.create({
    data: {
      providerEventId,
      eventType: messageStatus || "received",
      payload: body,
      processed: false,
    },
  });

  // Always 200 quickly; process async
  res.status(200).json({ ok: true });

  const io = (() => {
    try {
      return getIO();
    } catch {
      return null;
    }
  })();

  const processAsync = async () => {
    try {
      // Inbound message (SmsStatus=received)
      if (messageStatus === "received") {
        await prisma.$transaction(async (tx) => {
          const contact = await tx.contact.upsert({
            where: { phone: from },
            create: { phone: from, name: null, tags: [] },
            update: {},
          });

          const message = await tx.message.create({
            data: {
              direction: "INBOUND",
              status: "received",
              body: text,
              providerMessageId: providerMessageId || null,
              fromNumber: from,
              toNumber: to,
              contactId: contact.id,
            },
            include: { contact: true },
          });

          await tx.webhookEvent.update({
            where: { providerEventId },
            data: { processed: true },
          });

          if (io) {
            io.emit("message:received", message);
            io.to(`conversation:${contact.phone}`).emit("message:received", message);
          }
        });

        return;
      }

      // Outbound status callbacks (sent, delivered, failed, undelivered)
      if (["sent", "delivered", "failed", "undelivered"].includes(messageStatus)) {
        if (!providerMessageId) {
          await markProcessed(providerEventId);
          return;
        }

        const msg = await prisma.message.findUnique({
          where: { providerMessageId },
          include: { contact: true },
        });
        if (!msg) {
          await markProcessed(providerEventId);
          return;
        }

        const statusMap = {
          sent: "sent",
          delivered: "delivered",
          failed: "failed",
          undelivered: "failed",
        };
        const nextStatus = statusMap[messageStatus] || msg.status;

        const updated = await prisma.message.update({
          where: { id: msg.id },
          data: { status: nextStatus },
        });

        if (msg.campaignId) {
          await prisma.$transaction(async (tx) => {
            const cc = await tx.campaignContact.findUnique({
              where: { campaignId_contactId: { campaignId: msg.campaignId, contactId: msg.contactId } },
              select: { id: true, status: true },
            });
            if (cc) {
              if (nextStatus === "delivered") {
                await tx.campaignContact.update({
                  where: { id: cc.id },
                  data: { status: "delivered", deliveredAt: new Date() },
                });
                await tx.campaign.update({ where: { id: msg.campaignId }, data: { deliveredCount: { increment: 1 } } });
              } else if (nextStatus === "failed") {
                await tx.campaignContact.update({
                  where: { id: cc.id },
                  data: { status: "failed" },
                });
                await tx.campaign.update({ where: { id: msg.campaignId }, data: { failedCount: { increment: 1 } } });
              }
            }
          });
        }

        if (io) {
          const payloadOut = { messageId: updated.id, status: updated.status };
          if (nextStatus === "failed" && errorMessage) payloadOut.error = errorMessage;
          if (errorCode) payloadOut.errorCode = errorCode;
          io.emit("message:status", payloadOut);
          io.to(`conversation:${msg.contact.phone}`).emit("message:status", payloadOut);
        }

        await markProcessed(providerEventId);
        return;
      }

      await markProcessed(providerEventId);
    } catch (err) {
      console.error("[webhook] handler error", { providerEventId, messageStatus, err: err?.message });
    }
  };

  setImmediate(processAsync);
});

module.exports = { twilioWebhookRouter: router };

const express = require("express");
const { prisma } = require("../prisma/client");
const { validateWebhookSignature } = require("../services/telnyx.service");
const { getIO } = require("../socket");

const router = express.Router();

function safeString(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function extractProviderEventId(evt) {
  return evt?.data?.id || evt?.id || evt?.data?.payload?.id;
}

function extractEventType(evt) {
  return evt?.data?.event_type || evt?.event_type || evt?.data?.eventType;
}

function extractPayload(evt) {
  return evt?.data?.payload || evt?.payload || evt?.data;
}

function parseMessageFields(payload) {
  // Telnyx inbound/outbound payloads commonly contain:
  // payload.from.phone_number, payload.to[0].phone_number, payload.text, payload.id
  const from = payload?.from?.phone_number || payload?.from?.phoneNumber || payload?.from;
  const to = Array.isArray(payload?.to) ? payload?.to?.[0]?.phone_number : payload?.to?.phone_number || payload?.to;
  const text = payload?.text || payload?.body || payload?.message || "";
  const providerMessageId = payload?.id || payload?.message_id || payload?.messageId;
  const deliveryStatus = payload?.to?.[0]?.status || payload?.to?.[0]?.delivery_status || payload?.delivery_status;
  const error = payload?.to?.[0]?.errors?.[0]?.detail || payload?.errors?.[0]?.detail || payload?.errors;
  return { from: safeString(from).trim(), to: safeString(to).trim(), text: safeString(text), providerMessageId, deliveryStatus, error };
}

async function markProcessed(providerEventId) {
  await prisma.webhookEvent.update({
    where: { providerEventId },
    data: { processed: true },
  });
}

router.post("/telnyx", async (req, res) => {
  const signature = req.get("telnyx-signature-ed25519");
  const timestamp = req.get("telnyx-timestamp");
  const rawBody = req.body; // Buffer (express.raw)

  let evt;
  try {
    evt = validateWebhookSignature(rawBody, signature, timestamp);
  } catch (err) {
    console.error("[webhook] signature invalid", { err: err?.message, code: err?.code });
    return res.status(400).json({ error: "invalid signature" });
  }

  const providerEventId = extractProviderEventId(evt);
  const eventType = extractEventType(evt);
  const payload = extractPayload(evt);

  if (!providerEventId || !eventType) {
    console.error("[webhook] missing event metadata", { providerEventId, eventType });
    return res.status(400).json({ error: "bad event" });
  }

  // Idempotency guard
  const existing = await prisma.webhookEvent.findUnique({ where: { providerEventId }, select: { id: true } });
  if (existing) return res.status(200).json({ ok: true, deduped: true });

  // Store raw event immediately
  await prisma.webhookEvent.create({
    data: {
      providerEventId,
      eventType,
      payload: evt,
      processed: false,
    },
  });

  // Always 200 quickly; process after for non-sacred events
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
      if (eventType === "message.received") {
        // INBOUND SMS IS SACRED: validate → store → emit (in transaction)
        await prisma.$transaction(async (tx) => {
          const { from, to, text, providerMessageId: inboundProviderMessageId } = parseMessageFields(payload);

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
              providerMessageId: inboundProviderMessageId || null,
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

      if (eventType === "message.sent") {
        const { providerMessageId } = parseMessageFields(payload);
        if (!providerMessageId) {
          await markProcessed(providerEventId);
          return;
        }
        const msg = await prisma.message.findUnique({ where: { providerMessageId }, select: { id: true, contactId: true, contact: { select: { phone: true } } } });
        if (!msg) {
          await markProcessed(providerEventId);
          return;
        }
        const updated = await prisma.message.update({ where: { id: msg.id }, data: { status: "sent" } });
        if (io) {
          io.emit("message:status", { messageId: updated.id, status: updated.status });
          if (msg?.contact?.phone) io.to(`conversation:${msg.contact.phone}`).emit("message:status", { messageId: updated.id, status: updated.status });
        }
        await markProcessed(providerEventId);
        return;
      }

      if (eventType === "message.finalized") {
        const { providerMessageId, deliveryStatus, error } = parseMessageFields(payload);
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

        const nextStatus = deliveryStatus === "delivered" ? "delivered" : deliveryStatus === "failed" ? "failed" : msg.status;

        const updateData = { status: nextStatus };
        if (nextStatus === "failed" && error) {
          updateData.errorMessage = String(error);
        }

        const updated = await prisma.message.update({
          where: { id: msg.id },
          data: updateData,
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
          if (nextStatus === "failed" && error) payloadOut.error = error;
          io.emit("message:status", payloadOut);
          io.to(`conversation:${msg.contact.phone}`).emit("message:status", payloadOut);
        }

        await markProcessed(providerEventId);
        return;
      }

      await markProcessed(providerEventId);
    } catch (err) {
      console.error("[webhook] handler error", { providerEventId, eventType, err: err?.message });
      // Keep webhook event record for forensic purposes; do not throw.
    }
  };

  setImmediate(processAsync);
});

module.exports = { telnyxWebhookRouter: router };


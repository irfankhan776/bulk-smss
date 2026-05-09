const telnyx = require("telnyx")(process.env.TELNYX_API_KEY);
const { withExponentialBackoff } = require("./backoff");

class TelnyxError extends Error {
  constructor({ code, message, details }) {
    super(message);
    this.name = "TelnyxError";
    this.code = code || "TELNYX_ERROR";
    this.details = details;
  }
}

function toTelnyxError(err) {
  const code =
    err?.response?.data?.errors?.[0]?.code ||
    err?.response?.data?.errors?.[0]?.title ||
    err?.code ||
    "TELNYX_ERROR";
  const message =
    err?.response?.data?.errors?.[0]?.detail ||
    err?.response?.data?.errors?.[0]?.title ||
    err?.message ||
    "Telnyx request failed";
  return new TelnyxError({ code, message, details: err?.response?.data });
}

async function sendSingleSMS({ to, from, text }) {
  if (!to || !from || !text) {
    throw new TelnyxError({ code: "VALIDATION_ERROR", message: "to, from, and text are required" });
  }

  try {
    const res = await withExponentialBackoff(
      async () => {
        return await telnyx.messages.create({
          to,
          from,
          text,
        });
      },
      {
        retries: 3,
        onRetry: ({ attempt, delay, err }) => {
          console.error("[telnyx] send retry", { attempt, delay, err: err?.message });
        },
      }
    );

    const providerMessageId = res?.data?.id;
    const status = res?.data?.to?.[0]?.status || res?.data?.to?.[0]?.delivery_status || "sent";
    if (!providerMessageId) {
      throw new TelnyxError({ code: "TELNYX_BAD_RESPONSE", message: "Missing Telnyx message id" });
    }
    return { providerMessageId, status };
  } catch (err) {
    throw toTelnyxError(err);
  }
}

async function getNumbers() {
  try {
    const res = await withExponentialBackoff(
      async () => await telnyx.phoneNumbers.list({ page: { size: 100 } }),
      {
        retries: 3,
        onRetry: ({ attempt, delay, err }) => console.error("[telnyx] numbers retry", { attempt, delay, err: err?.message }),
      }
    );
    const items = res?.data || [];
    return items.map((n) => ({
      phoneNumber: n.phone_number,
      friendlyName: n?.friendly_name || n?.record_type || null,
      status: n?.status || null,
    }));
  } catch (err) {
    throw toTelnyxError(err);
  }
}

async function getBalance() {
  try {
    const res = await withExponentialBackoff(
      async () => await telnyx.balance.retrieve(),
      {
        retries: 3,
        onRetry: ({ attempt, delay, err }) => console.error("[telnyx] balance retry", { attempt, delay, err: err?.message }),
      }
    );
    const balance = res?.data?.balance;
    const currency = res?.data?.currency;
    return { balance, currency };
  } catch (err) {
    throw toTelnyxError(err);
  }
}

function validateWebhookSignature(rawBody, signatureHeader, timestampHeader) {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) {
    throw new TelnyxError({
      code: "WEBHOOK_CONFIG_MISSING",
      message: "TELNYX_PUBLIC_KEY must be set",
    });
  }

  try {
    // telnyx.webhooks.constructEvent throws if invalid
    return telnyx.webhooks.constructEvent(rawBody, signatureHeader, timestampHeader, publicKey);
  } catch (err) {
    throw new TelnyxError({ code: "WEBHOOK_SIGNATURE_INVALID", message: "Invalid webhook signature", details: err?.message });
  }
}

module.exports = {
  TelnyxError,
  sendSingleSMS,
  getNumbers,
  getBalance,
  validateWebhookSignature,
};


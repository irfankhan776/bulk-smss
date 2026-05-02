const twilio = require("twilio");
const { withExponentialBackoff } = require("./backoff");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let client = null;
function getClient() {
  if (!client) {
    if (!accountSid || !authToken) {
      throw new TwilioError({ code: "TWILIO_CONFIG_MISSING", message: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set" });
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

class TwilioError extends Error {
  constructor({ code, message, details }) {
    super(message);
    this.name = "TwilioError";
    this.code = code || "TWILIO_ERROR";
    this.details = details;
  }
}

function toTwilioError(err) {
  const code = err?.code || err?.status || "TWILIO_ERROR";
  const message = err?.message || "Twilio request failed";
  return new TwilioError({ code, message, details: err });
}

async function sendSingleSMS({ to, from, text }) {
  if (!to || !from || !text) {
    throw new TwilioError({ code: "VALIDATION_ERROR", message: "to, from, and text are required" });
  }

  try {
    const res = await withExponentialBackoff(
      async () => {
        return await getClient().messages.create({
          to,
          from,
          body: text,
        });
      },
      {
        retries: 3,
        onRetry: ({ attempt, delay, err }) => {
          console.error("[twilio] send retry", { attempt, delay, err: err?.message });
        },
      }
    );

    const providerMessageId = res?.sid;
    const status = res?.status || "sent";
    if (!providerMessageId) {
      throw new TwilioError({ code: "TWILIO_BAD_RESPONSE", message: "Missing Twilio message SID" });
    }
    return { providerMessageId, status };
  } catch (err) {
    throw toTwilioError(err);
  }
}

async function getNumbers() {
  try {
    const res = await withExponentialBackoff(
      async () => await getClient().incomingPhoneNumbers.list({ limit: 100 }),
      {
        retries: 3,
        onRetry: ({ attempt, delay, err }) => console.error("[twilio] numbers retry", { attempt, delay, err: err?.message }),
      }
    );
    const items = res || [];
    return items.map((n) => ({
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName || null,
      status: n.capabilities?.sms ? "active" : "inactive",
    }));
  } catch (err) {
    throw toTwilioError(err);
  }
}

async function getBalance() {
  try {
    const res = await withExponentialBackoff(
      async () => await getClient().api.v2010.balance().fetch(),
      {
        retries: 3,
        onRetry: ({ attempt, delay, err }) => console.error("[twilio] balance retry", { attempt, delay, err: err?.message }),
      }
    );
    const balance = res?.balance;
    const currency = res?.currency;
    return { balance, currency };
  } catch (err) {
    throw toTwilioError(err);
  }
}

function validateWebhookSignature(url, body, signature) {
  const authTokenVal = process.env.TWILIO_AUTH_TOKEN;
  if (!authTokenVal) {
    throw new TwilioError({
      code: "WEBHOOK_CONFIG_MISSING",
      message: "TWILIO_AUTH_TOKEN must be set for webhook validation",
    });
  }

  try {
    const isValid = twilio.validateRequest(authTokenVal, signature, url, body);
    if (!isValid) {
      throw new TwilioError({ code: "WEBHOOK_SIGNATURE_INVALID", message: "Invalid webhook signature" });
    }
    return true;
  } catch (err) {
    if (err instanceof TwilioError) throw err;
    throw new TwilioError({ code: "WEBHOOK_SIGNATURE_INVALID", message: "Invalid webhook signature", details: err?.message });
  }
}

module.exports = {
  TwilioError,
  sendSingleSMS,
  getNumbers,
  getBalance,
  validateWebhookSignature,
};

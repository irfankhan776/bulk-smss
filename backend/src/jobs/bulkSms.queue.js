const Queue = require("bull");

const redisUrl = process.env.REDIS_URL;

let bulkSmsQueue = null;

if (!redisUrl) {
  console.warn("[bull] REDIS_URL is not set — bulk SMS queue is DISABLED. Contact saving and other API routes will still work.");
} else {
  try {
    bulkSmsQueue = new Queue("bulk-sms", redisUrl, {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    console.log("[bull] bulk-sms queue connected");
  } catch (err) {
    console.error("[bull] Failed to connect to Redis:", err?.message);
    bulkSmsQueue = null;
  }
}

module.exports = { bulkSmsQueue };

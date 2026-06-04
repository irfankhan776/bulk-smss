const Queue = require("bull");

const redisUrl = process.env.REDIS_URL;

let campaignQueue = null;

if (!redisUrl) {
  console.warn("[campaign.queue] REDIS_URL is not set — campaign queue is DISABLED.");
} else {
  try {
    campaignQueue = new Queue("campaign", redisUrl, {
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
    console.log("[campaign.queue] connected");
  } catch (err) {
    console.error("[campaign.queue] Failed to connect to Redis:", err?.message);
    campaignQueue = null;
  }
}

module.exports = { campaignQueue };

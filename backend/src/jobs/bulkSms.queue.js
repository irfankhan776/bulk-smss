const Queue = require("bull");

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("REDIS_URL must be set");
}

const bulkSmsQueue = new Queue("bulk-sms", redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 500,
    removeOnFail: 500,
  },
});

module.exports = { bulkSmsQueue };


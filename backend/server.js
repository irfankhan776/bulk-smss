require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { apiRouter } = require("./src/routes");
const { telnyxWebhookRouter } = require("./src/webhooks/telnyx.webhook");
const { initSocket } = require("./src/socket");
const { prisma } = require("./src/prisma/client");

// Require worker to run inside the same process
require("./src/jobs/bulkSms.worker");

const PORT = parseInt(process.env.PORT || "4000", 10);
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(morgan("dev"));

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Webhook must receive raw body for signature validation
app.use("/api/webhooks", express.raw({ type: "application/json" }), telnyxWebhookRouter);

// Normal JSON routes
app.use(express.json({ limit: "2mb" }));
app.use("/api", apiRouter);

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err?.statusCode || 500;
  const payload = {
    error: err?.name || "Error",
    message: err?.message || "Internal Server Error",
  };
  if (err?.code) payload.code = err.code;
  console.error("[api] error", { statusCode, ...payload });
  res.status(statusCode).json(payload);
});

const server = http.createServer(app);
initSocket(server, { corsOrigin: FRONTEND_URL });

server.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});


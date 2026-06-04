// Entry point for the Railway worker service.
// This file is picked up by `node src/worker.js` in Railway.
require("dotenv").config();
require("./src/jobs/campaign.worker");

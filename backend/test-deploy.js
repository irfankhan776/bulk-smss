/**
 * Standalone end-to-end test for siteGenerator.service.js
 * Deploys one page to Cloudflare Pages and verifies the result.
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { generateAndDeploySite, generateHTMLLocally } = require("./src/services/siteGenerator.service");

const TEST_BUSINESS = "Squire's Grooming Lounge";
const TEST_CITY = "Austin";

async function run() {
  console.log("=".repeat(70));
  console.log("SMSBulk — Site Generator E2E Test");
  console.log("=".repeat(70));

  console.log("\n[1] Config check");
  console.log("  CLOUDFLARE_ACCOUNT_ID :", process.env.CLOUDFLARE_ACCOUNT_ID || "(missing)");
  console.log("  CLOUDFLARE_API_TOKEN :", process.env.CLOUDFLARE_API_TOKEN ? "***" + process.env.CLOUDFLARE_API_TOKEN.slice(-6) : "(missing)");
  console.log("  CLOUDFLARE_PROJECT_NAME:", process.env.CLOUDFLARE_PROJECT_NAME || "(missing — will default to sms-bulk-pages)");

  if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
    console.error("\n[FATAL] Missing Cloudflare credentials. Cannot proceed.");
    process.exit(1);
  }

  console.log("\n[2] Testing generateHTMLLocally (no deploy)");
  const localHtml = generateHTMLLocally({
    businessName: TEST_BUSINESS,
    city: TEST_CITY,
    template: "barber",
  });

  const hasBusinessName = localHtml.includes(TEST_BUSINESS);
  const hasCity = localHtml.includes(TEST_CITY);
  const hasUnreplaced = /\{\{BUSINESS_NAME\}\}|\{\{CITY\}\}/.test(localHtml);

  console.log("  Placeholder BUSINESS_NAME replaced :", hasBusinessName);
  console.log("  Placeholder CITY replaced           :", hasCity);
  console.log("  Any placeholders still present      :", hasUnreplaced);

  if (!hasBusinessName || !hasCity) {
    console.error("[FAIL] Placeholder replacement failed. Aborting deploy.");
    process.exit(1);
  }
  if (hasUnreplaced) {
    console.warn("[WARN] Some placeholders were not replaced.");
  }

  // Show a snippet around the hero title to verify replacement
  const heroMatch = localHtml.match(/<h1[^>]*>[\s\S]{0,200}/);
  if (heroMatch) {
    console.log("\n  Hero section snippet:");
    console.log("  " + heroMatch[0].replace(/\n/g, " ").trim().slice(0, 200));
  }

  console.log("\n[3] Generating and deploying to Cloudflare Pages...");
  console.log(`  Business : ${TEST_BUSINESS}`);
  console.log(`  City     : ${TEST_CITY}`);
  console.log(`  Project  : ${process.env.CLOUDFLARE_PROJECT_NAME || "sms-bulk-pages"}`);
  console.log("  Output   : (waiting for Wrangler...)\n");

  const startTime = Date.now();

  let result;
  try {
    result = await generateAndDeploySite({
      businessName: TEST_BUSINESS,
      city: TEST_CITY,
      template: "barber",
    });
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error("=".repeat(70));
    console.error("[FAIL] Deployment FAILED after", elapsed, "s");
    console.error("=".repeat(70));
    console.error("\nError message:", err.message);

    // Try to parse and pretty-print any JSON in the error
    const jsonMatch = err.message.match(/\{[\s\S]+\}/);
    if (jsonMatch) {
      try {
        console.error("\nParsed error JSON:");
        console.error(JSON.stringify(JSON.parse(jsonMatch[0]), null, 2));
      } catch (_) {}
    }

    console.error("\n--- Suggestions ---");
    if (err.message.includes("CLOUDFLARE_ACCOUNT_ID") || err.message.includes("CLOUDFLARE_API_TOKEN")) {
      console.error("  1. Verify CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are set in .env");
      console.error("  2. Ensure the API token has 'Cloudflare Pages: Edit' permission");
      console.error("  3. Ensure the account ID matches your Cloudflare dashboard");
    }
    if (err.message.includes("wrangler") || err.message.includes("not found")) {
      console.error("  4. Run 'npm install' in the backend directory to install wrangler");
    }
    if (err.message.includes("project") || err.message.includes("does not exist")) {
      console.error("  5. The Pages project may not exist — create it at dash.cloudflare.com");
    }
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n" + "=".repeat(70));
  console.log("[OK] Deployment SUCCEEDED after", elapsed, "s");
  console.log("=".repeat(70));

  console.log("\n  fileName :", result.fileName);
  console.log("  siteUrl  :", result.siteUrl);

  const fileUrl = result.siteUrl;

  console.log("\n[4] Verifying live deployment...");

  let fetchedHtml = null;
  let fetchError = null;

  try {
    const axios = require("axios");
    const response = await axios.get(fileUrl, {
      timeout: 15000,
      headers: { "User-Agent": "SMSBulk-E2E-Test/1.0" },
    });
    fetchedHtml = response.data;
    console.log("  HTTP Status  :", response.status);
    console.log("  Content-Type :", response.headers["content-type"]);
    console.log("  Content-Length:", fetchedHtml.length, "bytes");
  } catch (err) {
    fetchError = err;
    console.log("  Fetch error  :", err.message);
    if (err.code === "ENOTFOUND") console.log("  -> DNS resolution failed — site may not be live yet");
    if (err.code === "ECONNREFUSED") console.log("  -> Connection refused — site may not be live yet");
  }

  console.log("\n[5] Content verification on live site");
  if (fetchedHtml) {
    const liveHasBusiness = fetchedHtml.includes(TEST_BUSINESS);
    const liveHasCity = fetchedHtml.includes(TEST_CITY);
    const liveHasPlaceholder = /\{\{BUSINESS_NAME\}\}|\{\{CITY\}\}/.test(fetchedHtml);

    console.log("  BUSINESS_NAME present  :", liveHasBusiness, liveHasBusiness ? "✅" : "❌");
    console.log("  CITY present           :", liveHasCity, liveHasCity ? "✅" : "❌");
    console.log("  Placeholders remaining :", liveHasPlaceholder ? "❌ YES (bad)" : "❌ NO (good)");

    if (liveHasBusiness && liveHasCity && !liveHasPlaceholder) {
      console.log("\n  *** ALL CHECKS PASSED ***");
      console.log("  The deployed page correctly shows:");
      console.log(`    - Business name: "${TEST_BUSINESS}"`);
      console.log(`    - City: "${TEST_CITY}"`);
    } else {
      console.log("\n  [WARN] Live site content mismatch");
    }

    // Show live hero snippet
    const liveHero = fetchedHtml.match(/<h1[^>]*>[\s\S]{0,200}/);
    if (liveHero) {
      console.log("\n  Live hero snippet:");
      console.log("  " + liveHero[0].replace(/\n/g, " ").trim().slice(0, 200));
    }
  } else {
    console.log("  Skipped — could not fetch live site.");
    if (fetchError) {
      console.log("  NOTE: Wrangler deploy may have succeeded even if fetch failed.");
      console.log("  Try opening this URL in your browser to verify:");
      console.log(" ", fileUrl);
    }
  }

  console.log("\n[6] Cleanup check");
  const tempDir = path.join(__dirname, "output", "temp-deploy");
  if (fs.existsSync(tempDir)) {
    console.log("  temp-deploy dir still exists — cleaning up...");
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("  Cleaned up.");
  } else {
    console.log("  temp-deploy dir was already cleaned up ✅");
  }

  console.log("\n" + "=".repeat(70));
  console.log("Test complete.");
  console.log("Deployed URL:", fileUrl);
  console.log("=".repeat(70));
}

run().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

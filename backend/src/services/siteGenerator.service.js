const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const axios = require("axios");

const OUTPUT_DIR = path.join(__dirname, "../../output");

const TEMPLATES = {
  barber: path.join(__dirname, "../../barber-template.html"),
};

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_PROJECT_NAME = process.env.CLOUDFLARE_PROJECT_NAME || "sms-bulk-pages";

function slugify(text) {
  if (!text) return "";
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/**
 * Generate and deploy a single-business HTML page to Cloudflare Pages.
 *
 * @param {{ businessName: string, city: string, template: string }} params
 * @returns {Promise<{ siteUrl: string, fileName: string }>}
 */
async function generateAndDeploySite({ businessName, city, template = "barber" }) {
  const templatePath = TEMPLATES[template] || TEMPLATES.barber;

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  let htmlContent = fs.readFileSync(templatePath, "utf8");

  // Replace placeholders
  const replacements = [
    { key: "BUSINESS_NAME", value: businessName },
    { key: "CITY", value: city },
  ];

  replacements.forEach(({ key, value }) => {
    const patterns = [
      new RegExp(`{{\\s*${key}\\s*}}`, "g"),
      new RegExp(`{\\s*${key}\\s*}`, "g"),
    ];
    patterns.forEach((pattern) => {
      htmlContent = htmlContent.replace(pattern, value);
    });
  });

  const fileName = `${slugify(businessName)}-${slugify(city)}.html`;
  const tempDir = path.join(OUTPUT_DIR, "temp-deploy");
  const tempFilePath = path.join(tempDir, fileName);

  // Clean and create temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(tempFilePath, htmlContent, "utf8");

  // Deploy via Cloudflare Pages API
  const siteUrl = await deployToCloudflarePages(tempDir, fileName);

  // Cleanup temp directory
  fs.rmSync(tempDir, { recursive: true, force: true });

  return { siteUrl, fileName };
}

/**
 * Deploy a directory to Cloudflare Pages using the Cloudflare Pages API.
 * Uses the Wrangler CLI which is simpler and more reliable inside containers.
 */
async function deployToCloudflarePages(deployDir, fileName) {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in environment variables"
    );
  }

  // Use Wrangler Pages deploy — works in Railway container
  // Wrangler picks up CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from env automatically
  const wranglerCmd = `npx wrangler pages deploy "${deployDir}" --project-name "${CF_PROJECT_NAME}" --commit-message "Deploy ${fileName}"`;

  try {
    const output = execSync(wranglerCmd, {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: CF_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Parse the output to extract the URL
    const outputStr = output.toString();
    const urlMatch = outputStr.match(/https?:\/\/[^\s"']+\.pages\.dev[^\s"']*/);
    if (urlMatch) {
      return `${urlMatch[0]}/${fileName}`;
    }
    throw new Error(`Could not extract deployment URL from Wrangler output: ${outputStr}`);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : "";
    const stdout = err.stdout ? err.stdout.toString() : "";
    throw new Error(
      `Cloudflare Pages deployment failed. stderr: ${stderr}. stdout: ${stdout}. error: ${err.message}`
    );
  }
}

/**
 * Generate HTML locally (without deploying) — useful for preview.
 */
function generateHTMLLocally({ businessName, city, template = "barber" }) {
  const templatePath = TEMPLATES[template] || TEMPLATES.barber;
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  let htmlContent = fs.readFileSync(templatePath, "utf8");

  const replacements = [
    { key: "BUSINESS_NAME", value: businessName },
    { key: "CITY", value: city },
  ];

  replacements.forEach(({ key, value }) => {
    const patterns = [
      new RegExp(`{{\\s*${key}\\s*}}`, "g"),
      new RegExp(`{\\s*${key}\\s*}`, "g"),
    ];
    patterns.forEach((pattern) => {
      htmlContent = htmlContent.replace(pattern, value);
    });
  });

  return htmlContent;
}

module.exports = { generateAndDeploySite, generateHTMLLocally, slugify };

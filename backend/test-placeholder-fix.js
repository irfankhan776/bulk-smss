require("dotenv").config();
const path = require("path");

const businessName = "Squire's Grooming Lounge";
const city = "Austin";
const phone = "+1 (512) 555-0199";

const { generateHTMLLocally } = require("./src/services/siteGenerator.service");

const html = generateHTMLLocally({ businessName, city, phone });

// Check all placeholders
const checks = [
  { label: "BUSINESS_NAME", pattern: /\{\{BUSINESS_NAME\}\}/, expectReplaced: true },
  { label: "BUSINESS_NAME_SHORT", pattern: /\{\{BUSINESS_NAME_SHORT\}\}/, expectReplaced: true },
  { label: "CITY", pattern: /\{\{CITY\}\}/, expectReplaced: true },
  { label: "PHONE", pattern: /\{\{PHONE\}\}/, expectReplaced: true },
  { label: "PHONE_DISPLAY", pattern: /\{\{PHONE_DISPLAY\}\}/, expectReplaced: true },
  { label: "PHONE_RAW", pattern: /\{\{PHONE_RAW\}\}/, expectReplaced: true },
  { label: "INSTAGRAM_HANDLE", pattern: /\{\{INSTAGRAM_HANDLE\}\}/, expectReplaced: true },
  { label: '"The Squire\'s"', pattern: /The Squire/, expectReplaced: false },
];

console.log("\n=== PLACEHOLDER CHECK ===\n");
let allPassed = true;
for (const check of checks) {
  const found = check.pattern.test(html);
  const pass = check.expectReplaced ? !found : !found;
  const status = pass ? "✅ PASS" : "❌ FAIL";
  if (!pass) allPassed = false;
  console.log(`${status} | ${check.label} (expect ${check.expectReplaced ? "REPLACED" : "NOT present"}: ${found ? "FOUND" : "NOT FOUND"})`);
}

// Verify actual content
console.log("\n=== CONTENT VERIFICATION ===\n");
const verifications = [
  { label: "Business name in HTML", pattern: /Squire's Grooming Lounge/ },
  { label: "City in HTML", pattern: /Austin/ },
  { label: "Phone display", pattern: /\+1 \(512\) 555-0199/ },
  { label: "Phone raw (digits only)", pattern: /15125550199/ },
  { label: "Instagram handle (slugified)", pattern: /squires-grooming-lounge/ },
];
for (const v of verifications) {
  const found = v.pattern.test(html);
  console.log(`${found ? "✅" : "❌"} ${v.label}`);
  if (!found) allPassed = false;
}

console.log(`\n${allPassed ? "🎉 ALL CHECKS PASSED" : "⚠️ SOME CHECKS FAILED"}\n`);

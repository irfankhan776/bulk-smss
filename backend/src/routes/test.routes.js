const express = require("express");
const axios = require("axios");
const telnyx = require("telnyx")(process.env.TELNYX_API_KEY);
const { withExponentialBackoff } = require("../services/backoff");

const router = express.Router();

/**
 * GET /api/test/telnyx
 * Tests Telnyx: balance check, number listing, and a real SMS send to self.
 * Requires: TELNYX_API_KEY, DEFAULT_FROM_NUMBER, TEST_PHONE (your own number)
 */
router.get("/telnyx", async (req, res) => {
  const results = {};
  const testPhone = process.env.TEST_PHONE;

  try {
    const b = await withExponentialBackoff(() => telnyx.balance.retrieve(), { retries: 3 });
    results.balance = { balance: b.data.balance, currency: b.data.currency };
  } catch (e) {
    results.balance = { error: e?.response?.data?.errors?.[0]?.detail || e.message };
  }

  try {
    const n = await withExponentialBackoff(
      () => telnyx.phoneNumbers.list({ page: { size: 5 } }),
      { retries: 3 }
    );
    results.numbers = (n.data || []).map((num) => ({
      phoneNumber: num.phone_number,
      status: num.status,
    }));
  } catch (e) {
    results.numbers = { error: e?.response?.data?.errors?.[0]?.detail || e.message };
  }

  if (testPhone && process.env.DEFAULT_FROM_NUMBER) {
    try {
      const msg = await withExponentialBackoff(
        () =>
          telnyx.messages.create({
            to: testPhone,
            from: process.env.DEFAULT_FROM_NUMBER,
            text: "[SMSBulk Test] Your Telnyx API is working! Reply STOP to unsubscribe.",
          }),
        { retries: 3 }
      );
      results.sendTest = {
        ok: true,
        messageId: msg.data.id,
        to: testPhone,
        from: process.env.DEFAULT_FROM_NUMBER,
      };
    } catch (e) {
      results.sendTest = {
        error: e?.response?.data?.errors?.[0]?.detail || e.message,
        code: e?.response?.data?.errors?.[0]?.code,
      };
    }
  } else {
    results.sendTest = {
      skipped: true,
      reason: "TEST_PHONE env var not set. Set it to your phone number to test SMS sending.",
    };
  }

  const allOk = !results.balance?.error && !results.numbers?.error && !results.sendTest?.error;
  res.json({ provider: "telnyx", ok: allOk, results });
});

/**
 * GET /api/test/google-maps?apiKey=<key>&city=Austin+TX&niche=barber
 * Tests Google Places: searches for businesses with no website.
 */
router.get("/google-maps", async (req, res) => {
  const apiKey = req.query.apiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "apiKey query param or GOOGLE_MAPS_API_KEY env var required" });
  }

  const city = req.query.city || "Austin, TX";
  const niche = req.query.niche || "barber";

  try {
    const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
    const params = { query: `${niche} in ${city}`, key: apiKey };
    const response = await axios.get(url, { params, timeout: 10000 });

    if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
      return res.json({
        provider: "google-maps",
        ok: false,
        error: `Places API error: ${response.data.status}`,
        raw: response.data,
      });
    }

    const results = (response.data.results || []).slice(0, 5).map((p) => ({
      name: p.name,
      phone: p.formatted_phone_number || p.international_phone_number || null,
      website: p.website || null,
      address: p.formatted_address,
    }));

    res.json({
      provider: "google-maps",
      ok: true,
      searchQuery: `${niche} in ${city}`,
      totalReturned: response.data.results?.length || 0,
      preview: results,
    });
  } catch (e) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    res.json({
      provider: "google-maps",
      ok: false,
      error: e.message,
      details: status === 403 ? "403 Forbidden — API key may be invalid, restricted, or billing not enabled." : status === 400 ? "400 Bad Request — check apiKey format." : null,
      rawError: data?.error_message || null,
    });
  }
});

/**
 * GET /api/test/cloudflare
 * Tests Cloudflare Pages: validates credentials, lists projects.
 * Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_PROJECT_NAME
 */
router.get("/cloudflare", async (req, res) => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const projectName = process.env.CLOUDFLARE_PROJECT_NAME || "sms-bulk-pages";

  if (!accountId || !apiToken) {
    return res.status(400).json({
      error: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set",
    });
  }

  const headers = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" };

  try {
    // Step 1: Verify token by listing projects
    const projectsRes = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
      { headers, timeout: 10000 }
    );

    if (!projectsRes.data.success) {
      return res.json({
        provider: "cloudflare-pages",
        ok: false,
        error: "Cloudflare API returned success: false",
        details: projectsRes.data.errors,
      });
    }

    const projectExists = (projectsRes.data.result || []).find(
      (p) => p.name === projectName
    );

    // Step 2: List recent deployments if project exists
    let deployments = [];
    if (projectExists) {
      try {
        const depRes = await axios.get(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`,
          { headers, timeout: 10000 }
        );
        if (depRes.data.success) {
          deployments = (depRes.data.result || []).slice(0, 3).map((d) => ({
            id: d.id,
            url: d.url,
            created_on: d.created_on,
            latest: d.latest,
          }));
        }
      } catch {
        // Non-critical — project might exist but deployments listing fails
      }
    }

    res.json({
      provider: "cloudflare-pages",
      ok: true,
      accountId,
      projectName,
      projectExists: !!projectExists,
      recentDeployments: deployments,
      allProjects: (projectsRes.data.result || []).map((p) => p.name),
    });
  } catch (e) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    res.json({
      provider: "cloudflare-pages",
      ok: false,
      error: e.message,
      statusCode: status,
      details: status === 401 ? "Invalid Cloudflare API token." : status === 403 ? "Token lacks Pages permissions." : null,
      rawError: data?.errors?.[0]?.message || null,
    });
  }
});

/**
 * GET /api/test/all
 * Runs all tests in parallel — main entry point for a single-click test.
 */
router.get("/all", async (req, res) => {
  const testPhone = req.query.testPhone || process.env.TEST_PHONE;
  const googleApiKey = req.query.googleApiKey || process.env.GOOGLE_MAPS_API_KEY;

  const results = {};

  // Telnyx
  const telnyxResult = await (async () => {
    const r = {};
    try {
      const b = await withExponentialBackoff(() => telnyx.balance.retrieve(), { retries: 3 });
      r.balance = { balance: b.data.balance, currency: b.data.currency };
    } catch (e) {
      r.balance = { error: e?.response?.data?.errors?.[0]?.detail || e.message };
    }

    try {
      const n = await withExponentialBackoff(
        () => telnyx.phoneNumbers.list({ page: { size: 5 } }),
        { retries: 3 }
      );
      r.numbers = (n.data || []).map((num) => ({
        phoneNumber: num.phone_number,
        status: num.status,
      }));
    } catch (e) {
      r.numbers = { error: e?.response?.data?.errors?.[0]?.detail || e.message };
    }

    if (testPhone && process.env.DEFAULT_FROM_NUMBER) {
      try {
        const msg = await withExponentialBackoff(
          () =>
            telnyx.messages.create({
              to: testPhone,
              from: process.env.DEFAULT_FROM_NUMBER,
              text: "[SMSBulk] API test OK! Your keys are working.",
            }),
          { retries: 3 }
        );
        r.sendTest = { ok: true, messageId: msg.data.id, to: testPhone };
      } catch (e) {
        r.sendTest = {
          error: e?.response?.data?.errors?.[0]?.detail || e.message,
          code: e?.response?.data?.errors?.[0]?.code,
        };
      }
    } else {
      r.sendTest = { skipped: true, reason: "Set TEST_PHONE env var to enable SMS send test." };
    }
    return r;
  })();

  results.telnyx = { provider: "telnyx", ok: !telnyxResult.balance?.error && !telnyxResult.numbers?.error, ...telnyxResult };

  // Google Maps
  if (googleApiKey) {
    try {
      const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
      const response = await axios.get(url, {
        params: { query: "barber in Austin, TX", key: googleApiKey },
        timeout: 10000,
      });
      if (response.data.status !== "OK" && response.data.status !== "ZERO_RESULTS") {
        results.googleMaps = {
          provider: "google-maps",
          ok: false,
          error: `Places API error: ${response.data.status}`,
        };
      } else {
        results.googleMaps = {
          provider: "google-maps",
          ok: true,
          totalReturned: response.data.results?.length || 0,
          preview: (response.data.results || []).slice(0, 3).map((p) => ({
            name: p.name,
            phone: p.formatted_phone_number || null,
            website: p.website || null,
          })),
        };
      }
    } catch (e) {
      results.googleMaps = {
        provider: "google-maps",
        ok: false,
        error: e.message,
        details: e?.response?.status === 403 ? "403 Forbidden — API key restricted or billing not enabled." : null,
        rawError: e?.response?.data?.error_message || null,
      };
    }
  } else {
    results.googleMaps = { provider: "google-maps", skipped: true, reason: "No GOOGLE_MAPS_API_KEY env var or googleApiKey query param provided." };
  }

  // Cloudflare Pages
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) {
    const cfHeaders = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" };
    try {
      const pr = await axios.get(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
        { headers: cfHeaders, timeout: 10000 }
      );
      if (!pr.data.success) {
        results.cloudflare = { provider: "cloudflare-pages", ok: false, error: pr.data.errors?.[0]?.message || "API error" };
      } else {
        const projectExists = (pr.data.result || []).find((p) => p.name === (process.env.CLOUDFLARE_PROJECT_NAME || "sms-bulk-pages"));
        results.cloudflare = {
          provider: "cloudflare-pages",
          ok: true,
          projectExists: !!projectExists,
          projectName: process.env.CLOUDFLARE_PROJECT_NAME || "sms-bulk-pages",
          allProjects: (pr.data.result || []).map((p) => p.name),
        };
      }
    } catch (e) {
      results.cloudflare = {
        provider: "cloudflare-pages",
        ok: false,
        error: e.message,
        statusCode: e?.response?.status,
        details: e?.response?.status === 401 ? "Invalid API token." : e?.response?.status === 403 ? "Token missing Pages permissions." : null,
      };
    }
  } else {
    results.cloudflare = { provider: "cloudflare-pages", skipped: true, reason: "CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_API_TOKEN not set." };
  }

  const summary = {
    telnyx: results.telnyx.ok ? "PASS" : "FAIL",
    googleMaps: results.googleMaps?.skipped ? "SKIP" : results.googleMaps?.ok ? "PASS" : "FAIL",
    cloudflare: results.cloudflare?.skipped ? "SKIP" : results.cloudflare?.ok ? "PASS" : "FAIL",
  };

  res.json({ summary, results });
});

module.exports = { testRouter: router };

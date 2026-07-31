#!/usr/bin/env node
/**
 * Bing Webmaster SubmitUrl (single) — test script
 *
 * Usage:
 *   node src/test-bing-submiturl.js --file urls.txt
 *   node src/test-bing-submiturl.js https://example.com/a https://example.com/b
 *
 * Env (.env):
 *   BING_API_KEY=...
 *   BING_SITE_URL=https://medium.com   (or your verified site root)
 *
 * Notes:
 * - Uses Bing's SubmitUrl endpoint (not IndexNow).
 * - Adds 2–7s randomized pacing + 429 backoff.
 */

require("dotenv").config();
const fs = require("fs");
const axios = require("axios");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(minInclusive, maxInclusive) {
  const min = Math.ceil(minInclusive);
  const max = Math.floor(maxInclusive);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseRetryAfterMs(retryAfterHeader) {
  if (!retryAfterHeader) return null;
  const s = String(retryAfterHeader).trim();
  const asSeconds = Number(s);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;
  const asDate = Date.parse(s);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function readUrlsFromFile(p) {
  const raw = fs.readFileSync(p, "utf8");
  return raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith("#"));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { file: null, urls: [], siteUrl: null, minDelayMs: 2000, maxDelayMs: 7000 };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--file" && args[i + 1]) out.file = args[++i];
    else if (a === "--siteUrl" && args[i + 1]) out.siteUrl = args[++i];
    else if (a === "--minDelayMs" && args[i + 1]) out.minDelayMs = Number(args[++i]);
    else if (a === "--maxDelayMs" && args[i + 1]) out.maxDelayMs = Number(args[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
    else if (!a.startsWith("--")) out.urls.push(a);
  }
  return out;
}

async function submitToBingSubmitUrl({ apiKey, siteUrl, url, timeoutMs = 12000 }) {
  const endpoint = `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${encodeURIComponent(apiKey)}`;
  const res = await axios.post(
    endpoint,
    { siteUrl, url },
    {
      headers: { "Content-Type": "application/json" },
      timeout: timeoutMs,
      validateStatus: () => true,
    }
  );
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    data: res.data,
    retryAfterMs: parseRetryAfterMs(res.headers?.["retry-after"]),
  };
}

async function submitWithBackoff({ apiKey, siteUrl, url, maxRetries = 3 }) {
  let attempt = 0;
  let backoffMs = 30_000; // start 30s for 429s if no Retry-After

  // Optional “skip” to reduce bursts. Off by default for clear testing.
  // Example: set SKIP_RATE=0.02 (2%) in env to enable.
  const skipRate = Number(process.env.SKIP_RATE ?? "0");
  if (skipRate > 0 && Math.random() < skipRate) {
    return { skipped: true, reason: "random_skip" };
  }

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const r = await submitToBingSubmitUrl({ apiKey, siteUrl, url });
      if (r.ok) return { success: true, attempt, status: r.status };

      if (r.status === 429) {
        const waitMs = r.retryAfterMs ?? randomInt(Math.floor(backoffMs * 0.8), Math.floor(backoffMs * 1.3));
        if (attempt > maxRetries) return { success: false, attempt, status: r.status, error: "429 rate limited" };
        console.warn(`[429] ${url} — waiting ${Math.ceil(waitMs / 1000)}s then retrying (attempt ${attempt}/${maxRetries})`);
        await sleep(waitMs);
        backoffMs = Math.min(backoffMs * 2, 10 * 60_000);
        continue;
      }

      // Treat other non-2xx as a fail (no heavy retry loop)
      return { success: false, attempt, status: r.status, error: JSON.stringify(r.data || {}) };
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
      if (status === 429 && attempt <= maxRetries) {
        const retryAfterMs = parseRetryAfterMs(err?.response?.headers?.["retry-after"]);
        const waitMs = retryAfterMs ?? randomInt(Math.floor(backoffMs * 0.8), Math.floor(backoffMs * 1.3));
        console.warn(`[429] ${url} — waiting ${Math.ceil(waitMs / 1000)}s then retrying (attempt ${attempt}/${maxRetries})`);
        await sleep(waitMs);
        backoffMs = Math.min(backoffMs * 2, 10 * 60_000);
        continue;
      }
      return { success: false, attempt, status, error: msg };
    }
  }

  return { success: false, attempt: maxRetries + 1, error: "max retries exceeded" };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node src/test-bing-submiturl.js --file urls.txt
  node src/test-bing-submiturl.js https://url1 https://url2

Env:
  BING_API_KEY=...
  BING_SITE_URL=https://medium.com

Optional:
  --siteUrl <siteRoot>
  --minDelayMs 2000
  --maxDelayMs 7000
  SKIP_RATE=0.02 (set 0 to disable)
`);
    process.exit(0);
  }

  const apiKey = process.env.BING_API_KEY;
  const siteUrl = args.siteUrl || process.env.BING_SITE_URL;

  if (!apiKey) {
    console.error("Missing BING_API_KEY in environment (.env).");
    process.exit(1);
  }
  if (!siteUrl) {
    console.error("Missing BING_SITE_URL (or pass --siteUrl).");
    process.exit(1);
  }

  let urls = [...args.urls];
  if (args.file) urls.push(...readUrlsFromFile(args.file));
  urls = urls.map((u) => u.trim()).filter(Boolean);

  if (!urls.length) {
    console.error("No URLs provided. Use --file or pass URLs as arguments.");
    process.exit(1);
  }

  console.log(`Submitting ${urls.length} URL(s) to Bing SubmitUrl`);
  console.log(`siteUrl: ${siteUrl}\n`);

  let ok = 0;
  let fail = 0;
  let skipped = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const r = await submitWithBackoff({ apiKey, siteUrl, url, maxRetries: 3 });

    if (r.skipped) {
      skipped++;
      console.log(`[SKIP] ${url} (${r.reason})`);
    } else if (r.success) {
      ok++;
      console.log(`[SUCCESS] ${url} (status ${r.status}, attempt ${r.attempt})`);
    } else {
      fail++;
      console.error(`[FAIL] ${url} (status ${r.status ?? "n/a"}, attempt ${r.attempt}) ${r.error || ""}`);
    }

    const d = randomInt(args.minDelayMs, args.maxDelayMs);
    await sleep(d);
  }

  console.log(`\nDone. success=${ok} fail=${fail} skipped=${skipped}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
}


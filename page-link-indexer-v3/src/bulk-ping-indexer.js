/**
 * Bulk Ping Indexer — 2026 Ping Engines
 *
 * Run: node src/bulk-ping-indexer.js
 * Test endpoints: node src/bulk-ping-indexer.js test-endpoints
 */

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════

const DEFAULT_URLS_TO_PING = [
  // Add your Medium, LinkedIn, hub URLs here
];

const DEFAULT_PROXIES = [];

const DEFAULT_PROXY_ROTATE_EVERY = 3;

const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

const DEFAULT_REFERRERS = [
  "https://www.google.com/",
  "https://www.google.com/search?q=ai+agents+2026",
  "https://medium.com/",
];

// GET endpoints — the 4 that returned HTTP 200 in your tests.
const DEFAULT_PING_ENDPOINTS = [
  "https://webmaster.yandex.com/ping?sitemap=",
  "https://webmaster.yandex.ru/ping?sitemap=",
  "https://pingomatic.com/ping/?url=",
  "http://www.pingoat.net/ping.php?url=",
];

const DEFAULT_DELAY_MIN_MS = 3000;
const DEFAULT_DELAY_MAX_MS = 15000;

/**
 * Rate policy (2026-friendly, *compliance-first*):
 * - Intentionally spreads traffic (avoid bursts) and respects soft limits.
 * - Uses backoff on 429/5xx and endpoint cooldowns to reduce repeat rate-limit hits.
 * - Persists daily counters/cooldowns in a local state file (no Redis needed).
 *
 * Note: This file does NOT implement "stealth" evasion (e.g., fake referrers,
 * random Accept-Language churn, simulated failures). It focuses on respectful pacing.
 */
const DEFAULT_MAX_PINGS_PER_MINUTE = Number(process.env.PING_MAX_PER_MINUTE || 3); // e.g. 1–5
const DEFAULT_DAILY_MAX_TOTAL = Number(process.env.PING_DAILY_MAX_TOTAL || 250); // e.g. 100–300/day
const DEFAULT_DAILY_MAX_PER_ENDPOINT = Number(process.env.PING_DAILY_MAX_PER_ENDPOINT || 90); // e.g. 50–100/day/endpoint

const DEFAULT_RETRY_MAX = Number(process.env.PING_RETRY_MAX || 2); // retries after first attempt
const DEFAULT_BACKOFF_MIN_MS = Number(process.env.PING_BACKOFF_MIN_MS || 5 * 60 * 1000);
const DEFAULT_BACKOFF_MAX_MS = Number(process.env.PING_BACKOFF_MAX_MS || 30 * 60 * 1000);

const DEFAULT_ENDPOINT_COOLDOWN_FAIL_MS = Number(process.env.PING_ENDPOINT_COOLDOWN_FAIL_MS || 15 * 60 * 1000);
const DEFAULT_ENDPOINT_COOLDOWN_RATE_LIMIT_MS = Number(process.env.PING_ENDPOINT_COOLDOWN_RATE_LIMIT_MS || 30 * 60 * 1000);
const DEFAULT_DROP_ENDPOINT_24H_AFTER_FAILS = Number(process.env.PING_DROP_ENDPOINT_AFTER_FAILS || 10);

// Optional "distributed scheduling" inside a single long run.
// Leave disabled and instead run the script 2–4 times/day via Task Scheduler for best UX.
const DEFAULT_ENABLE_DISTRIBUTED = String(process.env.PING_ENABLE_DISTRIBUTED || "").toLowerCase() === "true";
const DEFAULT_DISTRIBUTED_CHUNK_SIZE = Number(process.env.PING_CHUNK_SIZE || 25);
const DEFAULT_CHUNK_GAP_MIN_MS = Number(process.env.PING_CHUNK_GAP_MIN_MS || 30 * 60 * 1000);
const DEFAULT_CHUNK_GAP_MAX_MS = Number(process.env.PING_CHUNK_GAP_MAX_MS || 90 * 60 * 1000);

// Extra: ping once per batch with long delay to reduce 429 (rate limit).
const GOOGLE_RPC2_URL = "https://blogsearch.google.com/ping/RPC2";
const EXTRA_DELAY_BEFORE_RPC_MS = 20000; // 20s before trying Google RPC2

// Endpoints not using simple GET — only used in test-endpoints (XML-RPC or POST).
const EXTRA_TEST_ENDPOINTS = [
  { name: "Google Blogsearch RPC2 (XML-RPC)", type: "xmlrpc", url: GOOGLE_RPC2_URL },
  { name: "PrePostSEO (POST)", type: "post", url: "https://www.prepostseo.com/ping-multiple-urls-online", formKey: "urls" },
  { name: "SmallSEOTools (POST)", type: "post", url: "https://smallseotools.com/ping-website", formKey: "url" },
];

// SmallSEOTools: try different methods/headers (405 = Method Not Allowed).
const SMALLSEOTOOLS_ATTEMPTS = [
  { method: "POST", formKey: "url", contentType: "application/x-www-form-urlencoded" },
  { method: "POST", formKey: "urls", contentType: "application/x-www-form-urlencoded" },
  { method: "GET", queryKey: "url" },
];

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clampNumber(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function getDayKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function randInt(min, max) {
  const a = Math.floor(Number(min));
  const b = Math.floor(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}

function randMs(minMs, maxMs) {
  return randInt(minMs, maxMs);
}

function pickRandom(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseProxy(proxyString) {
  if (!proxyString || typeof proxyString !== "string") return null;
  try {
    const url = new URL(proxyString);
    return {
      protocol: url.protocol.replace(":", ""),
      host: url.hostname,
      port: Number(url.port),
      auth: url.username || url.password ? { username: url.username, password: url.password } : undefined,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════
// LOCAL STATE (daily caps + cooldowns)
// ═══════════════════════════════════════

const STATE_FILE_PATH = path.join(__dirname, "..", ".bulk-ping-state.json");

function readJsonFileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("Warning: failed to write state file:", err.message);
  }
}

function loadState(statePath = STATE_FILE_PATH) {
  const today = getDayKey();
  const existing = readJsonFileIfExists(statePath);
  const state = existing && typeof existing === "object" ? existing : {};
  if (!state || typeof state !== "object") return { version: 1, day: today, totalDayCount: 0, endpoints: {} };

  state.version = 1;
  state.day = state.day || today;
  state.totalDayCount = Number(state.totalDayCount || 0);
  state.endpoints = state.endpoints && typeof state.endpoints === "object" ? state.endpoints : {};
  if (state.day !== today) {
    state.day = today;
    state.totalDayCount = 0;
    for (const key of Object.keys(state.endpoints)) {
      state.endpoints[key].day = today;
      state.endpoints[key].dayCount = 0;
      state.endpoints[key].consecutiveFail = 0;
      state.endpoints[key].cooldownUntil = 0;
    }
  }
  return state;
}

function getEndpointState(state, endpoint) {
  if (!state.endpoints[endpoint]) {
    state.endpoints[endpoint] = {
      day: state.day,
      dayCount: 0,
      successTotal: 0,
      failTotal: 0,
      consecutiveFail: 0,
      cooldownUntil: 0,
      lastStatus: null,
      lastError: null,
      lastUsedAt: 0,
    };
  }
  return state.endpoints[endpoint];
}

function recordEndpointResult(state, endpoint, result) {
  const es = getEndpointState(state, endpoint);
  es.day = state.day;
  es.dayCount = Number(es.dayCount || 0) + 1;
  es.lastUsedAt = Date.now();
  if (result && result.success) {
    es.successTotal = Number(es.successTotal || 0) + 1;
    es.consecutiveFail = 0;
    es.lastStatus = result.status ?? null;
    es.lastError = null;
  } else {
    es.failTotal = Number(es.failTotal || 0) + 1;
    es.consecutiveFail = Number(es.consecutiveFail || 0) + 1;
    es.lastStatus = result && "status" in result ? result.status : null;
    es.lastError = result && result.error ? String(result.error) : "Unknown error";
  }
}

function setEndpointCooldown(state, endpoint, cooldownMs) {
  const es = getEndpointState(state, endpoint);
  const until = Date.now() + Math.max(0, Number(cooldownMs || 0));
  es.cooldownUntil = Math.max(Number(es.cooldownUntil || 0), until);
}

function endpointIsAvailable(state, endpoint, options) {
  const es = getEndpointState(state, endpoint);
  const now = Date.now();
  if (Number(es.cooldownUntil || 0) > now) return false;
  const perEndpointCap = Number(options.dailyMaxPerEndpoint || DEFAULT_DAILY_MAX_PER_ENDPOINT);
  if (perEndpointCap > 0 && Number(es.dayCount || 0) >= perEndpointCap) return false;
  const dropAfter = Number(options.dropEndpointAfterFails ?? DEFAULT_DROP_ENDPOINT_24H_AFTER_FAILS);
  if (dropAfter > 0 && Number(es.consecutiveFail || 0) >= dropAfter) return false;
  return true;
}

function pickEndpointWeighted(endpoints, state, options, exclude = new Set()) {
  const candidates = [];
  for (const ep of endpoints || []) {
    if (!ep || exclude.has(ep)) continue;
    if (!endpointIsAvailable(state, ep, options)) continue;
    const es = getEndpointState(state, ep);
    const s = Number(es.successTotal || 0);
    const f = Number(es.failTotal || 0);
    const successRate = (s + 1) / (s + f + 2); // smoothing
    const consecutiveFail = Number(es.consecutiveFail || 0);
    // Weight: prefer historically-successful endpoints; penalize repeated recent failures.
    const weight = clampNumber(0.25 + successRate * 2 - consecutiveFail * 0.15, 0.1, 3.0);
    candidates.push({ ep, weight });
  }
  if (!candidates.length) return null;
  const total = candidates.reduce((acc, c) => acc + c.weight, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.ep;
  }
  return candidates[candidates.length - 1].ep;
}

// ═══════════════════════════════════════
// PACING (global per-minute cap + jitter)
// ═══════════════════════════════════════

function createPacer(options = {}) {
  const maxPerMinute = Number(options.maxPingsPerMinute ?? DEFAULT_MAX_PINGS_PER_MINUTE);
  const delayMinMs = Number(options.delayMinMs ?? DEFAULT_DELAY_MIN_MS);
  const delayMaxMs = Number(options.delayMaxMs ?? DEFAULT_DELAY_MAX_MS);
  const recent = [];

  return {
    async waitTurn() {
      const now = Date.now();
      const cutoff = now - 60_000;
      while (recent.length && recent[0] < cutoff) recent.shift();

      if (maxPerMinute > 0 && recent.length >= maxPerMinute) {
        const waitMs = Math.max(0, recent[0] + 60_000 - now);
        // Add a small jitter so multiple processes don't re-align.
        await sleep(waitMs + randMs(250, 1250));
      }

      const jitterDelay = delayMinMs + Math.random() * Math.max(0, delayMaxMs - delayMinMs);
      if (jitterDelay > 0) await sleep(jitterDelay);
      recent.push(Date.now());
    },
  };
}

// ═══════════════════════════════════════
// TEMP SITEMAP (optional)
// ═══════════════════════════════════════

function generateTempSitemap(urls, options = {}) {
  try {
    const baseUrl = options.publicBaseUrl || "https://yourdomain.com";
    const today = new Date().toISOString().split("T")[0];
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    urls.forEach((url) => {
      xml += `\n  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    });
    xml += `\n</urlset>`;
    const publicDir = path.join(__dirname, "..", "public");
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    const filename = `temp-sitemap-${crypto.randomBytes(8).toString("hex")}.xml`;
    const filePath = path.join(publicDir, filename);
    fs.writeFileSync(filePath, xml, "utf8");
    const sitemapUrl = `${baseUrl.replace(/\/+$/, "")}/public/${filename}`;
    console.log(`Generated temp sitemap: ${sitemapUrl}`);
    setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 24 * 60 * 60 * 1000);
    return sitemapUrl;
  } catch (err) {
    console.warn("Temp sitemap generation failed:", err.message);
    return null;
  }
}

// ═══════════════════════════════════════
// PING SINGLE URL
// ═══════════════════════════════════════

function buildProxyConfig(proxies, proxyRotateEvery, requestIndex) {
  let proxyConfig = false;
  if (proxies && proxies.length) {
    const rotate = Math.max(Number(proxyRotateEvery || 1), 1);
    const proxySlot = Math.floor(Number(requestIndex || 0) / rotate);
    const parsed = parseProxy(proxies[proxySlot % proxies.length]);
    if (parsed) {
      proxyConfig = { protocol: parsed.protocol, host: parsed.host, port: parsed.port };
      if (parsed.auth) proxyConfig.auth = parsed.auth;
    }
  }
  return proxyConfig || false;
}

function classifyPingOutcome(errOrResponse) {
  // Returns: { status, retryable, kind }
  const obj = errOrResponse && typeof errOrResponse === "object" ? errOrResponse : null;

  const rawStatus =
    obj && obj.status != null
      ? obj.status
      : obj && obj.response && obj.response.status != null
        ? obj.response.status
        : null;
  const status = rawStatus == null ? null : Number(rawStatus);

  if (Number.isFinite(status)) {
    const retryable = status === 429 || (status >= 500 && status <= 599) || status === 408;
    const kind = status === 429 ? "rate_limit" : status >= 500 ? "server_error" : "http_error";
    return { status, retryable, kind };
  }

  // Network errors/timeouts are usually retryable with backoff.
  const msg =
    (obj && (obj.error || obj.message) ? String(obj.error || obj.message) : "") || String(errOrResponse || "");
  const retryable = /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket|ETIMEDOUT/i.test(msg);
  return { status: null, retryable, kind: retryable ? "network_error" : "error" };
}

async function pingOnce(url, endpoint, ctx) {
  const { headers, proxies, proxyRotateEvery, requestIndex, timeoutMs } = ctx;
  const proxyConfig = buildProxyConfig(proxies, proxyRotateEvery, requestIndex);
  const fullPingUrl = `${endpoint}${encodeURIComponent(url)}`;
  try {
    const response = await axios.get(fullPingUrl, {
      proxy: proxyConfig || false,
      headers,
      timeout: Number(timeoutMs || 12000),
      maxRedirects: 5,
      // We intentionally accept all statuses so we can backoff/cooldown correctly.
      validateStatus: () => true,
    });
    const ok = response.status >= 200 && response.status < 400;
    if (ok) console.log(`[SUCCESS] ${url} → ${endpoint} (status ${response.status})`);
    else console.warn(`[FAIL] ${url} → ${endpoint} - status ${response.status}`);
    return { success: ok, url, endpoint, status: response.status };
  } catch (err) {
    const { status } = classifyPingOutcome(err);
    const msg = err && err.message ? err.message : "Request failed";
    console.warn(`[FAIL] ${url} → ${endpoint}${status ? ` (status ${status})` : ""} - ${msg}`);
    return { success: false, url, endpoint, status: status ?? undefined, error: msg };
  }
}

async function pingSingleUrlWithPolicy(url, ctx, state, options = {}) {
  const endpoints = ctx.endpoints || [];
  const retryMax = Number(options.retryMax ?? DEFAULT_RETRY_MAX);
  const backoffMinMs = Number(options.backoffMinMs ?? DEFAULT_BACKOFF_MIN_MS);
  const backoffMaxMs = Number(options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS);

  const exclude = new Set();
  let lastResult = null;

  for (let attempt = 0; attempt <= retryMax; attempt++) {
    const endpoint = pickEndpointWeighted(endpoints, state, options, exclude);
    if (!endpoint) {
      // All endpoints are capped/cooling down; wait a bit and try again.
      const waitMs = randMs(30_000, 120_000);
      console.warn(`No available endpoints (caps/cooldowns). Waiting ${Math.round(waitMs / 1000)}s...`);
      await sleep(waitMs);
      continue;
    }

    // Prevent global daily runaway.
    const dailyMaxTotal = Number(options.dailyMaxTotal ?? DEFAULT_DAILY_MAX_TOTAL);
    if (dailyMaxTotal > 0 && Number(state.totalDayCount || 0) >= dailyMaxTotal) {
      console.warn(`Daily total cap reached (${state.totalDayCount}/${dailyMaxTotal}). Stopping.`);
      return { success: false, url, endpoint, error: "Daily total cap reached", capped: true };
    }

    const result = await pingOnce(url, endpoint, { ...ctx, requestIndex: Number(ctx.requestIndex || 0) + attempt });
    lastResult = result;

    state.totalDayCount = Number(state.totalDayCount || 0) + 1;
    recordEndpointResult(state, endpoint, result);
    writeJsonFile(options.statePath || STATE_FILE_PATH, state);

    if (result.success) return result;

    const outcome = classifyPingOutcome(result);
    const retryable = outcome.retryable;

    // Cooldown logic to avoid hammering a struggling endpoint.
    if (outcome.kind === "rate_limit") {
      setEndpointCooldown(state, endpoint, DEFAULT_ENDPOINT_COOLDOWN_RATE_LIMIT_MS);
    } else if (outcome.kind === "server_error" || outcome.kind === "network_error") {
      setEndpointCooldown(state, endpoint, DEFAULT_ENDPOINT_COOLDOWN_FAIL_MS);
    } else {
      setEndpointCooldown(state, endpoint, randMs(2 * 60 * 1000, 6 * 60 * 1000));
    }
    writeJsonFile(options.statePath || STATE_FILE_PATH, state);

    if (!retryable || attempt >= retryMax) return result;

    exclude.add(endpoint);
    const backoffMs = randMs(backoffMinMs, backoffMaxMs);
    console.warn(
      `Retryable failure (${outcome.kind}${outcome.status ? ` ${outcome.status}` : ""}). Backing off ${Math.round(
        backoffMs / 1000
      )}s before retry ${attempt + 1}/${retryMax}...`
    );
    await sleep(backoffMs);
  }

  return lastResult || { success: false, url, endpoint: null, error: "Unknown failure" };
}

// ═══════════════════════════════════════
// PING VIA XML-RPC (e.g. Google Blogsearch RPC2)
// ═══════════════════════════════════════
function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function pingViaXmlRpc(targetUrl, rpcUrl) {
  const ua = pickRandom(DEFAULT_USER_AGENTS);
  const blogName = new URL(targetUrl).hostname || "Blog";
  const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.ping</methodName>
  <params>
    <param><value>${escapeXml(blogName)}</value></param>
    <param><value>${escapeXml(targetUrl)}</value></param>
    <param><value>${escapeXml(targetUrl)}</value></param>
  </params>
</methodCall>`;
  try {
    const res = await axios.post(rpcUrl, body, {
      headers: {
        "User-Agent": ua,
        "Content-Type": "text/xml",
        Accept: "*/*",
      },
      timeout: 12000,
      validateStatus: (s) => s >= 200 && s < 500,
    });
    const ok = res.status >= 200 && res.status < 400;
    if (ok) console.log(`[SUCCESS] ${targetUrl} → ${rpcUrl} (XML-RPC status ${res.status})`);
    else console.warn(`[FAIL] ${targetUrl} → ${rpcUrl} - status ${res.status}`);
    return { success: ok, url: targetUrl, endpoint: rpcUrl, status: res.status };
  } catch (err) {
    console.warn(`[FAIL] ${targetUrl} → ${rpcUrl} - ${err.message}`);
    return { success: false, url: targetUrl, endpoint: rpcUrl, error: err.message };
  }
}

// ═══════════════════════════════════════
// PING VIA POST FORM
// ═══════════════════════════════════════
async function pingViaPost(targetUrl, postUrl, formKey) {
  const ua = pickRandom(DEFAULT_USER_AGENTS);
  const body = new URLSearchParams({ [formKey]: targetUrl }).toString();
  try {
    const res = await axios.post(postUrl, body, {
      headers: {
        "User-Agent": ua,
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: postUrl,
      },
      timeout: 15000,
      validateStatus: (s) => s >= 200 && s < 500,
      maxRedirects: 5,
    });
    const ok = res.status >= 200 && res.status < 400;
    if (ok) console.log(`[SUCCESS] ${targetUrl} → ${postUrl} (POST status ${res.status})`);
    else console.warn(`[FAIL] ${targetUrl} → ${postUrl} - status ${res.status}`);
    return { success: ok, url: targetUrl, endpoint: postUrl, status: res.status };
  } catch (err) {
    console.warn(`[FAIL] ${targetUrl} → ${postUrl} - ${err.message}`);
    return { success: false, url: targetUrl, endpoint: postUrl, error: err.message };
  }
}

// Try SmallSEOTools with different method/form/query (they returned 405).
async function pingSmallSEOToolsVariants(targetUrl, baseUrl = "https://smallseotools.com/ping-website") {
  const ua = pickRandom(DEFAULT_USER_AGENTS);
  for (let k = 0; k < SMALLSEOTOOLS_ATTEMPTS.length; k++) {
    const att = SMALLSEOTOOLS_ATTEMPTS[k];
    try {
      if (att.method === "GET" && att.queryKey) {
        const url = `${baseUrl}?${att.queryKey}=${encodeURIComponent(targetUrl)}`;
        const res = await axios.get(url, {
          headers: { "User-Agent": ua, Referer: baseUrl },
          timeout: 15000,
          validateStatus: (s) => s >= 200 && s < 500,
        });
        const ok = res.status >= 200 && res.status < 400;
        console.log(`[SmallSEOTools attempt ${k + 1}] GET ?${att.queryKey}= → ${res.status} ${ok ? "SUCCESS" : "FAIL"}`);
        if (ok) return { success: true, url: targetUrl, endpoint: url, status: res.status };
      } else {
        const body = new URLSearchParams({ [att.formKey]: targetUrl }).toString();
        const res = await axios.post(baseUrl, body, {
          headers: {
            "User-Agent": ua,
            "Content-Type": att.contentType || "application/x-www-form-urlencoded",
            Referer: baseUrl,
            Origin: "https://smallseotools.com",
          },
          timeout: 15000,
          validateStatus: (s) => s >= 200 && s < 500,
        });
        const ok = res.status >= 200 && res.status < 400;
        console.log(`[SmallSEOTools attempt ${k + 1}] POST ${att.formKey}= → ${res.status} ${ok ? "SUCCESS" : "FAIL"}`);
        if (ok) return { success: true, url: targetUrl, endpoint: baseUrl, status: res.status };
      }
    } catch (err) {
      console.warn(`[SmallSEOTools attempt ${k + 1}] ${err.message}`);
    }
    await sleep(1500);
  }
  return { success: false, url: targetUrl, endpoint: baseUrl, error: "All attempts failed" };
}

// ═══════════════════════════════════════
// BATCH
// ═══════════════════════════════════════

async function bulkPingBatch(urls, options = {}) {
  if (!Array.isArray(urls)) urls = [urls];
  urls = urls.map((u) => String(u).trim()).filter(Boolean);
  if (!urls.length) {
    console.log("No URLs provided to bulkPingBatch.");
    return [];
  }

  const onResult = typeof options.onResult === "function" ? options.onResult : null;

  const statePath = options.statePath || STATE_FILE_PATH;
  const state = loadState(statePath);

  const proxies = options.proxies || DEFAULT_PROXIES;
  const endpoints = shuffleArray(options.endpoints || DEFAULT_PING_ENDPOINTS);
  const userAgents = options.userAgents || DEFAULT_USER_AGENTS;
  const referrers = options.referrers || DEFAULT_REFERRERS;
  const proxyRotateEvery = options.proxyRotateEvery || DEFAULT_PROXY_ROTATE_EVERY;
  const delayMin = options.delayMinMs ?? DEFAULT_DELAY_MIN_MS;
  const delayMax = options.delayMaxMs ?? DEFAULT_DELAY_MAX_MS;
  const timeoutMs = Number(options.timeoutMs ?? process.env.PING_TIMEOUT_MS ?? 12000);
  const useTempSitemap = options.useTempSitemap !== false;

  const maxPingsPerMinute = Number(options.maxPingsPerMinute ?? DEFAULT_MAX_PINGS_PER_MINUTE);
  const dailyMaxTotal = Number(options.dailyMaxTotal ?? DEFAULT_DAILY_MAX_TOTAL);
  const dailyMaxPerEndpoint = Number(options.dailyMaxPerEndpoint ?? DEFAULT_DAILY_MAX_PER_ENDPOINT);
  const retryMax = Number(options.retryMax ?? DEFAULT_RETRY_MAX);
  const distributedEnabled = Boolean(options.enableDistributed ?? DEFAULT_ENABLE_DISTRIBUTED);
  const chunkSize = Number(options.distributedChunkSize ?? DEFAULT_DISTRIBUTED_CHUNK_SIZE);
  const chunkGapMinMs = Number(options.chunkGapMinMs ?? DEFAULT_CHUNK_GAP_MIN_MS);
  const chunkGapMaxMs = Number(options.chunkGapMaxMs ?? DEFAULT_CHUNK_GAP_MAX_MS);

  // Stable per-run headers (reduces weird fingerprint churn; easier to debug).
  const ua = options.userAgent || userAgents[0] || pickRandom(userAgents) || "Mozilla/5.0";
  const referrer = options.referrer || null;
  const headers = {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": options.acceptLanguage || "en-US,en;q=0.9",
    Connection: "keep-alive",
    ...(referrer ? { Referer: referrer } : {}),
  };

  console.log(
    `Starting bulk ping batch for ${urls.length} URL(s) ` +
      `(max ${maxPingsPerMinute}/min, daily max ${dailyMaxTotal} total, ${dailyMaxPerEndpoint}/endpoint)`
  );
  const allResults = [];
  let requestIndex = 0;
  let sentThisRun = 0;
  const pacer = createPacer({ maxPingsPerMinute, delayMinMs: delayMin, delayMaxMs: delayMax });

  const policyOptions = {
    statePath,
    dailyMaxTotal,
    dailyMaxPerEndpoint,
    retryMax,
    backoffMinMs: options.backoffMinMs ?? DEFAULT_BACKOFF_MIN_MS,
    backoffMaxMs: options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS,
    dropEndpointAfterFails: options.dropEndpointAfterFails ?? DEFAULT_DROP_ENDPOINT_24H_AFTER_FAILS,
  };

  if (useTempSitemap) {
    const sitemapUrl = generateTempSitemap(urls, { publicBaseUrl: options.publicBaseUrl });
    if (sitemapUrl) {
      await pacer.waitTurn();
      const res = await pingSingleUrlWithPolicy(
        sitemapUrl,
        { endpoints, userAgents, referrers, proxies, proxyRotateEvery, requestIndex: requestIndex++, headers, timeoutMs },
        state,
        policyOptions
      );
      allResults.push(res);
      if (onResult) { try { onResult(res); } catch { /* ignore */ } }
      sentThisRun++;
    }
  }

  if (endpoints.length > 0) {
    for (const url of urls) {
      await pacer.waitTurn();
      const res = await pingSingleUrlWithPolicy(
        url,
        { endpoints, userAgents, referrers, proxies, proxyRotateEvery, requestIndex: requestIndex++, headers, timeoutMs },
        state,
        policyOptions
      );
      allResults.push(res);
      if (onResult) { try { onResult(res); } catch { /* ignore */ } }
      sentThisRun++;

      if (distributedEnabled && chunkSize > 0 && sentThisRun % chunkSize === 0) {
        const gapMs = randMs(chunkGapMinMs, chunkGapMaxMs);
        console.log(`Distributed pacing: sleeping ${Math.round(gapMs / 60000)} min after ${sentThisRun} pings...`);
        await sleep(gapMs);
      }

      // Hard stop if we hit our daily max mid-run.
      if (dailyMaxTotal > 0 && Number(state.totalDayCount || 0) >= dailyMaxTotal) break;
    }
  }

  // Optional: one Google Blogsearch RPC2 ping per batch (long delay to avoid 429).
  // Off by default: enable only when you explicitly set pingGoogleRpc2: true.
  const doRpc2 = options.pingGoogleRpc2 === true;
  const extraDelayMs = options.extraDelayBeforeRpcMs ?? EXTRA_DELAY_BEFORE_RPC_MS;
  if (doRpc2 && urls.length > 0) {
    console.log(`Waiting ${extraDelayMs / 1000}s before Google RPC2 ping...`);
    await sleep(extraDelayMs);
    const firstUrl = urls[0];
    const rpcRes = await pingViaXmlRpc(firstUrl, GOOGLE_RPC2_URL);
    allResults.push(rpcRes);
  }

  const successCount = allResults.filter((r) => r.success).length;
  console.log(`Batch complete: ${successCount}/${allResults.length} successful pings`);
  return allResults;
}

module.exports = { bulkPingBatch, generateTempSitemap };

// ═══════════════════════════════════════
// CLI
// ═══════════════════════════════════════

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const mode = args[0] || "batch";

      const getArgValue = (name) => {
        const idx = args.indexOf(name);
        if (idx === -1) return null;
        const v = args[idx + 1];
        if (v == null || String(v).startsWith("--")) return null;
        return String(v);
      };

      const getNumberArg = (name, fallback) => {
        const v = getArgValue(name);
        if (v == null) return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };

      const readUrlsFromFile = (p) => {
        const raw = fs.readFileSync(p, "utf8");
        return raw
          .split(/\r?\n/g)
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s) => !s.startsWith("#"));
      };

      const parseCliUrls = () => {
        let list = [];
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === "--file" && args[i + 1]) {
            const p = args[++i];
            list.push(...readUrlsFromFile(p));
            continue;
          }
          if (String(a).startsWith("http://") || String(a).startsWith("https://")) list.push(a);
        }
        // Common usage: node script.js <url1> <url2> ... (no explicit mode)
        const knownModes = new Set(["batch", "scheduled", "test-endpoints"]);
        if (!knownModes.has(mode) && list.length === 0) {
          list = args.filter((a) => a && !String(a).startsWith("--"));
        }
        return list.map((u) => String(u).trim()).filter(Boolean);
      };

      if (mode === "test-endpoints") {
        const testUrl = DEFAULT_URLS_TO_PING[0] || "https://en.wikipedia.org/wiki/Artificial_intelligence";
        console.log(`Testing each endpoint once with URL: ${testUrl}\n`);

        const headers = {
          "User-Agent": DEFAULT_USER_AGENTS[0] || "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
        };

        let i = 0;
        for (const endpoint of DEFAULT_PING_ENDPOINTS) {
          console.log(`>>> Testing GET ${i + 1}/${DEFAULT_PING_ENDPOINTS.length}\n${endpoint}`);
          await pingOnce(testUrl, endpoint, {
            headers,
            proxies: DEFAULT_PROXIES,
            proxyRotateEvery: DEFAULT_PROXY_ROTATE_EVERY,
            requestIndex: i++,
          });
          await sleep(DEFAULT_DELAY_MIN_MS + Math.random() * (DEFAULT_DELAY_MAX_MS - DEFAULT_DELAY_MIN_MS));
        }

        for (let j = 0; j < EXTRA_TEST_ENDPOINTS.length; j++) {
          const spec = EXTRA_TEST_ENDPOINTS[j];
          console.log(`\n>>> Testing EXTRA ${j + 1}/${EXTRA_TEST_ENDPOINTS.length} (${spec.type})\n${spec.name}\n${spec.url}`);
          if (spec.type === "xmlrpc") {
            console.log("Waiting 20s before RPC2 to reduce rate limit...");
            await sleep(EXTRA_DELAY_BEFORE_RPC_MS);
            await pingViaXmlRpc(testUrl, spec.url);
          } else if (spec.url && spec.url.includes("smallseotools")) {
            await pingSmallSEOToolsVariants(testUrl, spec.url);
          } else if (spec.type === "post" && spec.formKey) {
            await pingViaPost(testUrl, spec.url, spec.formKey);
          }
          await sleep(DEFAULT_DELAY_MIN_MS + Math.random() * (DEFAULT_DELAY_MAX_MS - DEFAULT_DELAY_MIN_MS));
        }

        console.log("\nEndpoint test complete.");
      } else {
        const scheduledEnabled = mode === "scheduled";
        const cliUrls = parseCliUrls();
        const urlsToPing = cliUrls.length ? cliUrls : DEFAULT_URLS_TO_PING;

        // Optional CLI tuning
        const delayMinMs = getNumberArg("--minDelayMs", undefined);
        const delayMaxMs = getNumberArg("--maxDelayMs", undefined);
        const maxPerMinute = getNumberArg("--ppm", getNumberArg("--maxPerMinute", undefined));
        const dailyMaxTotal = getNumberArg("--dailyMaxTotal", undefined);
        const dailyMaxPerEndpoint = getNumberArg("--dailyMaxPerEndpoint", undefined);
        const retryMax = getNumberArg("--retryMax", undefined);
        const skipProbability = getNumberArg("--skipProbability", undefined);

        await bulkPingBatch(urlsToPing, {
          proxies: DEFAULT_PROXIES,
          endpoints: DEFAULT_PING_ENDPOINTS,
          userAgents: DEFAULT_USER_AGENTS,
          referrers: DEFAULT_REFERRERS,
          proxyRotateEvery: DEFAULT_PROXY_ROTATE_EVERY,
          useTempSitemap: false,
          pingGoogleRpc2: false,
          scheduledEnabled,
          ...(delayMinMs != null ? { delayMinMs } : {}),
          ...(delayMaxMs != null ? { delayMaxMs } : {}),
          ...(maxPerMinute != null ? { maxPingsPerMinute: maxPerMinute } : {}),
          ...(dailyMaxTotal != null ? { dailyMaxTotal } : {}),
          ...(dailyMaxPerEndpoint != null ? { dailyMaxPerEndpoint } : {}),
          ...(retryMax != null ? { retryMax } : {}),
          ...(skipProbability != null ? { skipProbability } : {}),
        });
      }
    } catch (err) {
      console.error("Bulk ping failed:", err);
      process.exitCode = 1;
    }
  })();
}

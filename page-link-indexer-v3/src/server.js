/**
 * Page Link Indexer — API Server v3.1
 * Express server with REST API, SSE, webhooks, 9 indexing strategies (2026 + YouTube)
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const PageLinkIndexer = require("./indexer");
const { bulkPingBatch } = require("./bulk-ping-indexer");
const { bulkPingWithWindscribeRotation } = require("./bulk-ping-rotate");
const { bulkShorten } = require("./shorteners");
const { serpInspectUrl } = require("./serp-inspect");
const { processSocialUrls } = require("./socials");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../dashboard")));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: "Rate limited" } });
app.use("/api/", apiLimiter);

// ─── Initialize Indexer ───
const mongoUriEnv = (process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MongoDB_URL || "").trim();
const useMongoSites = !!mongoUriEnv;
const indexer = new PageLinkIndexer({
  siteUrl: process.env.SITE_URL,
  sitemapUrl: process.env.SITEMAP_URL,
  googleServiceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) : null,
  indexNowKey: process.env.INDEXNOW_KEY || undefined,
  indexNowKeyLocation: process.env.INDEXNOW_KEY_LOCATION,
  bingApiKey: process.env.BING_API_KEY,
  yandexAccessToken: process.env.YANDEX_ACCESS_TOKEN,
  yandexUserId: process.env.YANDEX_USER_ID,
  yandexHostId: process.env.YANDEX_HOST_ID,
  rssFeedUrl: process.env.RSS_FEED_URL,
  websubEnabled: process.env.WEBSUB_ENABLED !== "false",
  googleContentType: process.env.GOOGLE_CONTENT_TYPE || "url_updated",
  gscSiteUrl: process.env.GSC_SITE_URL || null,
  dataDir: process.env.DATA_DIR,
  useMongoSites,
  enableHistory: false,
  enableFileLog: false,
  enableVideoStore: true,
});

// ═══════════════════════════════════════
// QUEUE / SCHEDULER (for high volume, owned sites only)
// ═══════════════════════════════════════

const QUEUE_ENABLED = process.env.QUEUE_ENABLED !== "false";
const QUEUE_RATE_PER_MIN = Math.max(parseFloat(process.env.QUEUE_RATE_PER_MIN || "2"), 0.1); // jobs/min
const QUEUE_DAILY_LIMIT = Math.max(parseInt(process.env.QUEUE_DAILY_LIMIT || "300", 10), 0);
const QUEUE_MAX_ATTEMPTS = Math.max(parseInt(process.env.QUEUE_MAX_ATTEMPTS || "5", 10), 1);
const QUEUE_BACKOFF_MIN_MS = Math.max(parseInt(process.env.QUEUE_BACKOFF_MIN_MS || String(5 * 60 * 1000), 10), 1000); // 5m
const QUEUE_BACKOFF_MAX_MS = Math.max(parseInt(process.env.QUEUE_BACKOFF_MAX_MS || String(30 * 60 * 1000), 10), 1000); // 30m
const QUEUE_JITTER_MS = Math.max(parseInt(process.env.QUEUE_JITTER_MS || "5000", 10), 0); // jitter for nextRunAt

const QUEUE_DATA_DIR = (process.env.DATA_DIR && String(process.env.DATA_DIR).trim())
  ? String(process.env.DATA_DIR).trim()
  : path.join(__dirname, "../data");
const QUEUE_FILE = path.join(QUEUE_DATA_DIR, "queue.json");

function _today() { return new Date().toISOString().split("T")[0]; }
function _randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function _now() { return Date.now(); }

function ensureQueueDir() {
  try { if (!fs.existsSync(QUEUE_DATA_DIR)) fs.mkdirSync(QUEUE_DATA_DIR, { recursive: true }); } catch { /* ignore */ }
}

function safeReadJson(p, fallback) {
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch { /* ignore */ }
  return fallback;
}

function safeWriteJson(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8"); } catch { /* ignore */ }
}

class QueueManager {
  constructor() {
    this.paused = false;
    this.running = false;
    this.nextAllowedAt = 0;
    this.state = { jobs: [], statsByDay: {} };
    ensureQueueDir();
    const loaded = safeReadJson(QUEUE_FILE, null);
    if (loaded && loaded.jobs) this.state = loaded;
    this._normalizeState();
  }

  _normalizeState() {
    if (!this.state || typeof this.state !== "object") this.state = { jobs: [], statsByDay: {} };
    if (!Array.isArray(this.state.jobs)) this.state.jobs = [];
    if (!this.state.statsByDay || typeof this.state.statsByDay !== "object") this.state.statsByDay = {};
  }

  _save() {
    this._normalizeState();
    safeWriteJson(QUEUE_FILE, this.state);
  }

  _getTodayStats() {
    const day = _today();
    if (!this.state.statsByDay[day]) {
      this.state.statsByDay[day] = { date: day, processed: 0, success: 0, failed: 0, rateLimited: 0 };
    }
    return this.state.statsByDay[day];
  }

  getStatus() {
    const now = _now();
    const due = this.state.jobs.filter((j) => (j.status === "queued" || j.status === "retry") && (j.nextRunAt || 0) <= now).length;
    const queued = this.state.jobs.filter((j) => j.status === "queued" || j.status === "retry").length;
    const failedFinal = this.state.jobs.filter((j) => j.status === "failed_final").length;
    const active = this.state.jobs.find((j) => j.status === "running") || null;
    const today = this._getTodayStats();
    return {
      enabled: QUEUE_ENABLED,
      paused: this.paused,
      running: this.running,
      ratePerMin: QUEUE_RATE_PER_MIN,
      dailyLimit: QUEUE_DAILY_LIMIT,
      today,
      counts: { queued, due, failedFinal, total: this.state.jobs.length },
      activeJob: active ? { id: active.id, url: active.url, attempts: active.attempts, nextRunAt: active.nextRunAt } : null,
      nextAllowedAt: this.nextAllowedAt,
    };
  }

  pause() { this.paused = true; return this.getStatus(); }
  resume() { this.paused = false; this._kick(); return this.getStatus(); }
  clearFailed() {
    this.state.jobs = this.state.jobs.filter((j) => j.status !== "failed_final");
    this._save();
    return this.getStatus();
  }

  enqueueJobs(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    for (const j of list) {
      this.state.jobs.push(j);
    }
    this._save();
    this._kick();
    return { enqueued: list.length, queueSize: this.state.jobs.length };
  }

  _kick() {
    if (!QUEUE_ENABLED) return;
    if (this.running) return;
    this.running = true;
    setTimeout(() => this._loop(), 250);
  }

  _computeBackoffMs(attempts, isRateLimited) {
    const pow = Math.min(attempts, 6);
    const base = QUEUE_BACKOFF_MIN_MS * Math.pow(2, Math.max(pow - 1, 0));
    const capped = Math.min(base, QUEUE_BACKOFF_MAX_MS);
    const jitter = _randInt(0, Math.max(Math.floor(capped * 0.15), 1000));
    // If rate-limited, bias upward slightly
    const bias = isRateLimited ? _randInt(30 * 1000, 3 * 60 * 1000) : 0;
    return Math.min(capped + jitter + bias, QUEUE_BACKOFF_MAX_MS);
  }

  _extractSignals(results) {
    // results is what submitAll returns; try to detect rate limit or server errors.
    const signals = { rateLimited: false, had5xx: false, had429: false };
    const services = results && results.services ? results.services : {};
    for (const entries of Object.values(services)) {
      if (!Array.isArray(entries)) continue;
      for (const e of entries) {
        if (!e) continue;
        if (e.status === "rate_limited") signals.rateLimited = true;
        const sc = e.statusCode;
        if (sc === 429) signals.had429 = true;
        if (typeof sc === "number" && sc >= 500) signals.had5xx = true;
        if (typeof e.error === "string" && e.error.includes("429")) signals.had429 = true;
      }
    }
    return signals;
  }

  _pickNextJob() {
    const now = _now();
    const candidates = this.state.jobs
      .filter((j) => (j.status === "queued" || j.status === "retry") && (j.nextRunAt || 0) <= now)
      .sort((a, b) => (a.nextRunAt || 0) - (b.nextRunAt || 0));
    return candidates.length ? candidates[0] : null;
  }

  async _runJob(job) {
    job.status = "running";
    job.lastRunAt = new Date().toISOString();
    this._save();

    const { siteUrl, sitemapUrl, gscSiteUrl } = job.site || {};
    if (siteUrl || sitemapUrl || gscSiteUrl) {
      indexer.setSiteContext({ siteUrl, sitemapUrl, gscSiteUrl });
    }

    try {
      const results = await indexer.submitAll([job.url], { services: job.services });
      const signals = this._extractSignals(results);
      const ok = !!(results && results.summary && (results.summary.success > 0 || results.summary.accepted > 0));

      const today = this._getTodayStats();
      today.processed++;
      if (signals.rateLimited || signals.had429) today.rateLimited++;
      if (ok) today.success++; else today.failed++;

      if (ok) {
        job.status = "completed";
        job.completedAt = new Date().toISOString();
        job.lastResult = results.summary;
        // Remove completed jobs to keep file small
        this.state.jobs = this.state.jobs.filter((j) => j.id !== job.id);
        this._save();
        return;
      }

      job.attempts = (job.attempts || 0) + 1;
      job.lastResult = results.summary;
      job.lastError = signals.rateLimited || signals.had429 ? "rate_limited" : "failed";

      if (job.attempts >= QUEUE_MAX_ATTEMPTS) {
        job.status = "failed_final";
        job.failedAt = new Date().toISOString();
      } else {
        const backoff = this._computeBackoffMs(job.attempts, signals.rateLimited || signals.had429 || signals.had5xx);
        job.status = "retry";
        job.nextRunAt = _now() + backoff;
      }
      this._save();
    } catch (err) {
      const today = this._getTodayStats();
      today.processed++;
      today.failed++;
      job.attempts = (job.attempts || 0) + 1;
      job.lastError = err.message || "error";
      if (job.attempts >= QUEUE_MAX_ATTEMPTS) {
        job.status = "failed_final";
        job.failedAt = new Date().toISOString();
      } else {
        const backoff = this._computeBackoffMs(job.attempts, true);
        job.status = "retry";
        job.nextRunAt = _now() + backoff;
      }
      this._save();
    }
  }

  async _loop() {
    try {
      if (!QUEUE_ENABLED) return;
      if (this.paused) return;

      const today = this._getTodayStats();
      if (QUEUE_DAILY_LIMIT > 0 && today.processed >= QUEUE_DAILY_LIMIT) {
        // Sleep until next day boundary-ish (check again in 10 minutes)
        setTimeout(() => this._loop(), 10 * 60 * 1000);
        return;
      }

      const now = _now();
      if (now < this.nextAllowedAt) {
        setTimeout(() => this._loop(), Math.min(2000, this.nextAllowedAt - now));
        return;
      }

      const job = this._pickNextJob();
      if (!job) {
        setTimeout(() => this._loop(), 2000);
        return;
      }

      // Enforce pacing + jitter
      const minInterval = Math.max(Math.floor(60000 / QUEUE_RATE_PER_MIN), 200);
      const jitter = _randInt(0, QUEUE_JITTER_MS);
      this.nextAllowedAt = _now() + minInterval + jitter;

      await this._runJob(job);
      setTimeout(() => this._loop(), 0);
    } finally {
      // keep loop alive
    }
  }
}

const queue = new QueueManager();
if (QUEUE_ENABLED) queue.resume();

// ─── SSE Clients ───
const sseClients = new Set();

indexer.on("url:indexed", (entry) => {
  broadcast({ type: "url:indexed", data: entry });
});
indexer.on("submit:complete", (results) => {
  broadcast({ type: "submit:complete", data: results.summary });
});

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch { sseClients.delete(client); }
  }
}

// ─── Auth Middleware ───
const auth = (req, res, next) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return next();
  const provided = req.headers["x-api-key"] || req.headers.authorization?.replace("Bearer ", "") || req.query.api_key;
  if (provided !== apiKey) return res.status(401).json({ error: "Invalid API key" });
  next();
};

// ═══════════════════════════════════════
// CORE API
// ═══════════════════════════════════════

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), version: "3.1.0", timestamp: new Date().toISOString() });
});

// SSE endpoint
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: {\"type\":\"connected\"}\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ═══════════════════════════════════════
// QUEUE API (owned sites only)
// ═══════════════════════════════════════

app.get("/api/queue/status", auth, (req, res) => {
  res.json({ success: true, status: queue.getStatus() });
});

app.post("/api/queue/pause", auth, (req, res) => {
  res.json({ success: true, status: queue.pause() });
});

app.post("/api/queue/resume", auth, (req, res) => {
  res.json({ success: true, status: queue.resume() });
});

app.post("/api/queue/clear-failed", auth, (req, res) => {
  res.json({ success: true, status: queue.clearFailed() });
});

// Enqueue URLs for background processing.
// IMPORTANT: Only URLs matching Saved Sites (owned) will be accepted.
app.post("/api/queue/enqueue", auth, (req, res) => {
  const urls = Array.isArray(req.body.urls) ? req.body.urls : (req.body.url ? [req.body.url] : []);
  const services = req.body.services;
  const explicitSiteUrl = req.body.siteUrl != null ? String(req.body.siteUrl).trim() : "";
  const explicitSitemapUrl = req.body.sitemapUrl != null ? String(req.body.sitemapUrl).trim() : "";
  const explicitGscSiteUrl = req.body.gscSiteUrl != null ? String(req.body.gscSiteUrl).trim() : "";

  const raw = urls.map((u) => String(u || "").trim()).filter(Boolean);
  const unique = [...new Set(raw)];
  if (!unique.length) return res.status(400).json({ error: "No URLs provided" });

  const savedSites = indexer.getSites();
  const savedBySiteUrl = new Map(savedSites.map((s) => [String(s.siteUrl || "").trim(), s]));
  const defaultSite = savedSites && savedSites.length ? savedSites[0] : null;
  const isYouTubeUrl = (rawUrl) => {
    try {
      const u = new URL(String(rawUrl));
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
    } catch { return false; }
  };

  let fixedSite = null;
  if (explicitSiteUrl) {
    fixedSite = savedBySiteUrl.get(explicitSiteUrl) || null;
    if (!fixedSite) {
      return res.status(400).json({ error: "siteUrl must match an existing Saved Site (owned) to use the queue." });
    }
  }

  const jobs = [];
  const rejected = [];
  const now = _now();

  for (const url of unique) {
    let site = fixedSite || indexer.resolveSiteForUrl(url);
    if (!site && defaultSite && isYouTubeUrl(url)) site = defaultSite;
    if (!site || !site.siteUrl) {
      rejected.push({ url, reason: "No matching Saved Site" });
      continue;
    }

    const nextRunAt = now + _randInt(0, QUEUE_JITTER_MS);
    jobs.push({
      id: crypto.randomBytes(8).toString("hex"),
      url,
      services,
      attempts: 0,
      status: "queued",
      createdAt: new Date().toISOString(),
      nextRunAt,
      site: {
        siteUrl: site.siteUrl,
        sitemapUrl: explicitSitemapUrl || site.sitemapUrl || "",
        gscSiteUrl: explicitGscSiteUrl || site.siteUrl,
      },
    });
  }

  const out = queue.enqueueJobs(jobs);
  res.json({ success: true, ...out, rejectedCount: rejected.length, rejected });
});

// Prepare RSS feed submission URLs (Medium usernames → RSS feeds → aggregator links)
app.post("/api/prepare-rss-submissions", (req, res) => {
  const input = req.body.input != null ? String(req.body.input).trim() : "";
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: "No input provided" });

  const feeds = lines.map((line) => {
    if (/^https?:\/\//i.test(line)) return line;
    const username = line.startsWith("@") ? line.slice(1) : line;
    return `https://medium.com/feed/@${username}`;
  });

  const submissions = feeds.map((feed) => {
    const title = "Medium @" + (feed.split("@")[1] || "feed").replace(/\/.*$/, "") || "Unknown";
    return {
      feedUrl: feed,
      rssAppUrl: `https://rss.app/rss-feed/create-rss-feed-from-medium?url=${encodeURIComponent(feed.replace(/\/feed.*$/, ""))}`,
      feedspotUrl: `https://www.feedspot.com/add_feed?feedUrl=${encodeURIComponent(feed)}&title=${encodeURIComponent(title)}`,
      feedlyUrl: `https://feedly.com/i/subscription/feed/${encodeURIComponent(feed)}`,
      inoreaderUrl: `https://www.inoreader.com/add-subscription?url=${encodeURIComponent(feed)}`,
    };
  });

  return res.json({ success: true, submissions });
});

// Submit URLs to all 9 services
app.post("/api/index", auth, async (req, res) => {
  try {
    let urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    const services = req.body.services;
    let siteUrl = req.body.siteUrl != null ? String(req.body.siteUrl).trim() : "";
    let sitemapUrl = req.body.sitemapUrl != null ? String(req.body.sitemapUrl).trim() : "";
    const gscSiteUrl = req.body.gscSiteUrl != null ? String(req.body.gscSiteUrl).trim() : "";
    if (!urls.length) return res.status(400).json({ error: "No URLs provided" });

    const hasExplicitSite = !!(siteUrl || sitemapUrl || gscSiteUrl);

    if (hasExplicitSite) {
      indexer.setSiteContext({ siteUrl: siteUrl || undefined, sitemapUrl: sitemapUrl || undefined, gscSiteUrl: gscSiteUrl || undefined });
      const results = await indexer.submitAll(urls, { services });
      return res.json({ success: true, submitted: results.urlCount, results });
    }

    // No site URL provided: resolve each URL from Saved Sites and group by site.
    // Special case: YouTube URLs will be attached to a default Saved Site (first one),
    // so they can still be submitted via YouTube + IndexNow/Bing even though the host
    // is youtube.com / youtu.be.
    const savedSites = indexer.getSites();
    const defaultSite = savedSites && savedSites.length ? savedSites[0] : null;
    const isYouTubeUrl = (raw) => {
      try {
        const u = new URL(String(raw));
        const host = u.hostname.toLowerCase().replace(/^www\./, "");
        return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
      } catch {
        return false;
      }
    };

    const groups = new Map();
    const noSiteUrls = [];
    for (const url of urls) {
      let site = indexer.resolveSiteForUrl(url);
      if (!site && defaultSite && isYouTubeUrl(url)) {
        site = defaultSite;
      }
      if (site && site.siteUrl) {
        const key = site.siteUrl;
        if (!groups.has(key)) groups.set(key, { site, urls: [] });
        groups.get(key).urls.push(url);
      } else {
        noSiteUrls.push(url);
      }
    }

    if (groups.size === 0 && noSiteUrls.length > 0) {
      return res.status(400).json({
        error: "None of the URLs match a Saved Site. Add the site in Saved Sites first, or enter Site URL above.",
      });
    }

    const mergeOne = (into, from) => {
      if (!from || !from.services) return;
      for (const [k, v] of Object.entries(from.services)) {
        if (Array.isArray(v)) {
          into.services[k] = (into.services[k] || []).concat(v);
        } else if (v && typeof v === "object" && v !== null && !Array.isArray(v)) {
          if (into.services[k] == null) into.services[k] = { ...v };
          else if (Array.isArray(into.services[k])) { /* keep existing array when this group had skipped/error */ }
          else into.services[k] = v;
        } else {
          into.services[k] = v;
        }
      }
      const s = from.summary || {};
      into.summary.total += s.total || 0;
      into.summary.success += s.success || 0;
      into.summary.failed += s.failed || 0;
      into.summary.accepted += s.accepted || 0;
      into.summary.skipped += s.skipped || 0;
    };

    const merged = {
      id: require("crypto").randomBytes(8).toString("hex"),
      timestamp: new Date().toISOString(),
      urlCount: urls.length,
      urls,
      services: {},
      summary: { total: 0, success: 0, failed: 0, accepted: 0, skipped: 0 },
    };

    for (const [, { site, urls: groupUrls }] of groups) {
      indexer.setSiteContext({ siteUrl: site.siteUrl, sitemapUrl: site.sitemapUrl || undefined, gscSiteUrl: site.siteUrl });
      const result = await indexer.submitAll(groupUrls, { services });
      mergeOne(merged, result);
    }

    if (noSiteUrls.length > 0) {
      merged.skippedUrls = noSiteUrls;
      merged.skippedMessage = `${noSiteUrls.length} URL(s) had no matching Saved Site and were not submitted.`;
    }

    res.json({ success: true, submitted: merged.urlCount, results: merged });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Google only
app.post("/api/index/google", auth, async (req, res) => {
  try {
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs" });
    const results = await indexer.submitToGoogle(urls);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IndexNow only
app.post("/api/index/indexnow", auth, async (req, res) => {
  try {
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs" });
    const results = await indexer.submitToIndexNow(urls);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bing Webmaster only
app.post("/api/index/bing", auth, async (req, res) => {
  try {
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs" });
    const results = await indexer.submitToBingWebmaster(urls);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSub publish
app.post("/api/index/websub", auth, async (req, res) => {
  try {
    const urls = req.body.urls || [];
    const results = await indexer.publishToWebSub(urls);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RSS ping
app.post("/api/index/rss-ping", auth, async (req, res) => {
  try {
    const results = await indexer.pingRSSServices();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sitemap ping
app.post("/api/sitemap/ping", auth, async (req, res) => {
  try {
    const siteUrl = req.body.siteUrl;
    const sitemapUrl = req.body.sitemapUrl;
    if (siteUrl || sitemapUrl) indexer.setSiteContext({ siteUrl, sitemapUrl });
    const results = await indexer.pingSitemap(sitemapUrl);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Social Indexing Endpoint (matches dashboard)
app.post("/api/socials", auth, async (req, res) => {
  try {
    const items = req.body.items || [];
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    // Prefer items (structured), fallback to urls (strings)
    const inputs = items.length > 0 ? items : urls;

    const titlePrefix = req.body.titlePrefix || 'Article';
    
    if (!inputs.length) return res.status(400).json({ error: "No URLs provided" });
    
    const results = await processSocialUrls(inputs, titlePrefix);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test WordPress publishing
app.post("/api/wordpress/test", auth, async (req, res) => {
  try {
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs provided" });
    
    const results = await processSocialUrls(urls);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// External (third-party) URLs: only generic pings, no owner-only APIs.
app.post("/api/index/external", auth, async (req, res) => {
  try {
    const urls = Array.isArray(req.body.urls) ? req.body.urls : (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs provided" });

    // Use first Saved Site or SITE_URL as context for pings (feed/sitemap base), but we do NOT
    // claim ownership of the external URLs themselves. This endpoint never calls Google Indexing
    // API, Bing Webmaster API, or spec-strict IndexNow.
    const savedSites = indexer.getSites();
    const baseSiteUrl = (savedSites && savedSites.length ? savedSites[0].siteUrl : null) || process.env.SITE_URL || null;
    if (baseSiteUrl) {
      indexer.setSiteContext({ siteUrl: baseSiteUrl });
    }

    const services = {};

    // WebSub ping (if enabled) — pushes an update for your feed/sitemap so crawlers
    // can discover the external links through your own site.
    if (indexer.config.websubEnabled) {
      services.webSub = await indexer.publishToWebSub(urls);
    } else {
      services.webSub = { skipped: true, reason: "WebSub disabled" };
    }

    // RSS/XML-RPC ping — not tied to ownership of the external hosts, but still uses your site/feed.
    try {
      services.rssPing = await indexer.pingRSSServices();
    } catch (e) {
      services.rssPing = { error: e.message };
    }

    // Light Bing URL ping for each external URL (unofficial; use sparingly).
    const uniqueUrls = [...new Set(urls.map((u) => String(u).trim()).filter(Boolean))];
    const maxUrls = uniqueUrls.slice(0, 50); // safety cap
    const bingResults = [];
    for (const url of maxUrls) {
      try {
        const r = await axios.get("https://www.bing.com/ping", {
          params: { url },
          timeout: 8000,
          headers: {
            // Use a browser-like UA; some Bing endpoints are picky about scripted clients.
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          },
        });
        bingResults.push({ url, status: "success", statusCode: r.status });
      } catch (e) {
        bingResults.push({ url, status: "failed", error: e.message });
      }
    }
    services.bingUrlPing = bingResults;

    res.json({ success: true, results: { services } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// BULK PING (External URLs) — Background Jobs
// ═══════════════════════════════════════

const bulkPingJobs = new Map(); // id -> job
const BULK_PING_MAX_URLS = Math.max(parseInt(process.env.BULK_PING_MAX_URLS || "500", 10), 1);
const BULK_PING_MAX_RESULTS_STORED = Math.max(parseInt(process.env.BULK_PING_MAX_RESULTS_STORED || "250", 10), 50);
const BULK_PING_MAX_CONCURRENT = Math.max(parseInt(process.env.BULK_PING_MAX_CONCURRENT || "1", 10), 1);
let bulkPingWorkerActive = false;

function parseUrlsLoose(input) {
  if (Array.isArray(input)) return input.map((u) => String(u || "").trim()).filter(Boolean);
  const text = String(input || "");
  // split on newlines/commas/spaces (keeps http(s) URLs)
  return text
    .split(/[\r\n,\t ]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^https?:\/\//i.test(s));
}

function pruneOldBulkPingJobs() {
  // Keep memory small: drop jobs older than 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, j] of bulkPingJobs.entries()) {
    const t = Date.parse(j.finishedAt || j.createdAt || "") || 0;
    if (t && t < cutoff) bulkPingJobs.delete(id);
  }
}

function currentBulkPingRunningCount() {
  let n = 0;
  for (const j of bulkPingJobs.values()) if (j.status === "running") n++;
  return n;
}

function pickNextQueuedBulkPingJob() {
  const jobs = Array.from(bulkPingJobs.values());
  jobs.sort((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0));
  return jobs.find((j) => j.status === "queued") || null;
}

async function runBulkPingJob(job, urls) {
  job.status = "running";
  job.startedAt = new Date().toISOString();
  console.log(`[BulkPing] running job ${job.id} urls=${job.originalUrlCount || job.urlCount}`);

  try {
    const commonBulkOptions = {
      useTempSitemap: false,
      delayMinMs: job.options.delayMinMs,
      delayMaxMs: job.options.delayMaxMs,
      maxPingsPerMinute: job.options.maxPingsPerMinute,
      dailyMaxTotal: job.options.dailyMaxTotal,
      dailyMaxPerEndpoint: job.options.dailyMaxPerEndpoint,
      retryMax: job.options.retryMax,
      enableDistributed: job.options.enableDistributed,
      timeoutMs: job.options.timeoutMs,
      backoffMinMs: job.options.backoffMinMs,
      backoffMaxMs: job.options.backoffMaxMs,
      endpoints: job.options.endpoints,
      onResult: (r) => {
        job.progress.attempted++;
        if (r && r.success) job.progress.success++;
        else job.progress.failed++;
        job.results.push({
          ts: new Date().toISOString(),
          url: r.url,
          endpoint: r.endpoint,
          success: !!r.success,
          status: r.status ?? null,
          error: r.success ? null : (r.error || null),
        });
        if (job.results.length > BULK_PING_MAX_RESULTS_STORED) {
          job.results.splice(0, job.results.length - BULK_PING_MAX_RESULTS_STORED);
        }
      },
    };

    const runPing = async (pingUrls) => {
      if (job.options.enableIpRotation) {
        await bulkPingWithWindscribeRotation(pingUrls, commonBulkOptions, {
          enabled: true,
          chunkSize: job.options.rotationChunkSize,
          pauseMinMs: job.options.rotationPauseMinMs,
          pauseMaxMs: job.options.rotationPauseMaxMs,
          cliPath: job.options.windscribeCliPath,
          targets: job.options.windTargets,
          connectWaitMs: job.options.windConnectWaitMs,
        });
      } else {
        await bulkPingBatch(pingUrls, commonBulkOptions);
      }
    };

    // 1) Ping originals (always)
    await runPing(urls);

    // 2) Optionally ping short links as an additional pass
    if (job.options.enablePingShortLinks) {
      job.shortening = { status: "running", total: urls.length, ok: 0, fail: 0 };
      const shortened = await bulkShorten(urls, {
        delayMinMs: job.options.shortenDelayMinMs,
        delayMaxMs: job.options.shortenDelayMaxMs,
        maxRetries: job.options.shortenMaxRetries,
        timeoutMs: job.options.shortenTimeoutMs,
        cuttlyApiKey: process.env.CUTTLY_API_KEY || undefined,
        verbose: false,
      });
      const shortUrls = [];
      for (const r of shortened) {
        if (r && r.short) {
          shortUrls.push(r.short);
          job.shortening.ok++;
        } else {
          job.shortening.fail++;
        }
      }
      job.shortening.status = "completed";
      job.shortening.shortCount = shortUrls.length;

      if (shortUrls.length) {
        await runPing(shortUrls);
      }
    }

    job.status = "completed";
    job.finishedAt = new Date().toISOString();
    console.log(`[BulkPing] completed job ${job.id} ok=${job.progress.success} fail=${job.progress.failed}`);
  } catch (e) {
    job.status = "failed";
    job.finishedAt = new Date().toISOString();
    job.lastError = e && e.message ? e.message : String(e);
    console.warn(`[BulkPing] failed job ${job.id}: ${job.lastError}`);
  }
}

async function kickBulkPingWorker() {
  if (bulkPingWorkerActive) return;
  bulkPingWorkerActive = true;
  try {
    while (currentBulkPingRunningCount() < BULK_PING_MAX_CONCURRENT) {
      const job = pickNextQueuedBulkPingJob();
      if (!job) break;
      // URLs are not stored in the job object; keep them in-memory by attaching once.
      // (This is safe for dev use; if you want persistence across restarts we can store them.)
      if (!Array.isArray(job._urls) || job._urls.length !== job.urlCount) {
        // If missing, we cannot run it.
        job.status = "failed";
        job.finishedAt = new Date().toISOString();
        job.lastError = "Job URLs not available (server restarted). Start again.";
        continue;
      }
      await runBulkPingJob(job, job._urls);
    }
  } finally {
    bulkPingWorkerActive = false;
  }
}

app.post("/api/bulk-ping/start", auth, async (req, res) => {
  try {
    pruneOldBulkPingJobs();
    if (currentBulkPingRunningCount() >= BULK_PING_MAX_CONCURRENT) {
      return res.status(429).json({ error: "Bulk ping is busy. Try again in a moment." });
    }

    const urls = parseUrlsLoose(req.body.urls || req.body.input || req.body.text || req.body.url);
    const unique = [...new Set(urls)].slice(0, BULK_PING_MAX_URLS);
    if (!unique.length) return res.status(400).json({ error: "No valid URLs provided" });

    const opts = req.body.options && typeof req.body.options === "object" ? req.body.options : {};
    const jobId = crypto.randomBytes(10).toString("hex");
    const plannedMultiplier = opts.enablePingShortLinks === true ? 2 : 1;

    const job = {
      id: jobId,
      status: "queued",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      originalUrlCount: unique.length,
      urlCount: unique.length * plannedMultiplier,
      _urls: unique,
      options: {
        // randomized delay min/max (ms) + per-minute cap
        delayMinMs: opts.delayMinMs ?? 3000,
        delayMaxMs: opts.delayMaxMs ?? 15000,
        maxPingsPerMinute: opts.maxPingsPerMinute ?? 3,
        dailyMaxTotal: opts.dailyMaxTotal ?? 250,
        dailyMaxPerEndpoint: opts.dailyMaxPerEndpoint ?? 90,
        retryMax: opts.retryMax ?? 2,
        backoffMinMs: opts.backoffMinMs ?? Number(process.env.PING_BACKOFF_MIN_MS || 5 * 60 * 1000),
        backoffMaxMs: opts.backoffMaxMs ?? Number(process.env.PING_BACKOFF_MAX_MS || 30 * 60 * 1000),
        timeoutMs: opts.timeoutMs ?? Number(process.env.PING_TIMEOUT_MS || 12000),
        endpoints: Array.isArray(opts.endpoints) ? opts.endpoints : undefined,
        enableDistributed: opts.enableDistributed ?? false,

        // IP rotation (Windscribe) — disabled unless explicitly enabled in UI/request
        enableIpRotation: opts.enableIpRotation === true,
        rotationChunkSize: opts.rotationChunkSize ?? Number(process.env.BULK_PING_ROTATE_CHUNK_SIZE || 200),
        rotationPauseMinMs: opts.rotationPauseMinMs ?? Number(process.env.BULK_PING_ROTATE_PAUSE_MIN_MS || 120000),
        rotationPauseMaxMs: opts.rotationPauseMaxMs ?? Number(process.env.BULK_PING_ROTATE_PAUSE_MAX_MS || 180000),
        windscribeCliPath: opts.windscribeCliPath ?? process.env.WINDSCRIBE_CLI_PATH,
        windTargets: Array.isArray(opts.windTargets) ? opts.windTargets : undefined,
        windConnectWaitMs: opts.windConnectWaitMs ?? Number(process.env.WIND_CONNECT_WAIT_MS || 10000),

        // Short links ping (disabled unless explicitly enabled)
        enablePingShortLinks: opts.enablePingShortLinks === true,
        shortenDelayMinMs: opts.shortenDelayMinMs ?? Number(process.env.SHORTEN_DELAY_MIN_MS || 1500),
        shortenDelayMaxMs: opts.shortenDelayMaxMs ?? Number(process.env.SHORTEN_DELAY_MAX_MS || 4500),
        shortenMaxRetries: opts.shortenMaxRetries ?? Number(process.env.SHORTEN_MAX_RETRIES || 2),
        shortenTimeoutMs: opts.shortenTimeoutMs ?? Number(process.env.SHORTEN_TIMEOUT_MS || 15000),
      },
      progress: { attempted: 0, success: 0, failed: 0 },
      results: [],
      lastError: null,
    };

    bulkPingJobs.set(jobId, job);
    console.log(`[BulkPing] queued job ${jobId} urls=${unique.length}`);
    // Run in background; respond immediately.
    setTimeout(() => { void kickBulkPingWorker(); }, 10);

    res.json({ success: true, jobId, urlCount: unique.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/bulk-ping/status/:id", auth, (req, res) => {
  const id = String(req.params.id || "").trim();
  const job = bulkPingJobs.get(id);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ success: true, job });
});

// Feedburner pings: treat each provided URL as a feed URL (e.g. Medium /feed, site RSS, etc.).
app.post("/api/index/feedburner", auth, async (req, res) => {
  try {
    const feeds = Array.isArray(req.body.urls) ? req.body.urls : (req.body.url ? [req.body.url] : []);
    const uniqueFeeds = [...new Set(feeds.map((u) => String(u).trim()).filter(Boolean))];
    if (!uniqueFeeds.length) return res.status(400).json({ error: "No feed URLs provided" });

    const maxFeeds = uniqueFeeds.slice(0, 50); // safety cap
    const results = [];
    for (const feedUrl of maxFeeds) {
      try {
        const r = await axios.get("https://ping.feedburner.com/ping", {
          params: { feedUrl },
          timeout: 8000,
        });
        results.push({ feedUrl, status: "success", statusCode: r.status });
      } catch (e) {
        results.push({ feedUrl, status: "failed", error: e.message });
      }
    }

    res.json({ success: true, results: { services: { feedburnerPing: results } } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GSC sitemap resubmit
app.post("/api/sitemap/resubmit", auth, async (req, res) => {
  try {
    const siteUrl = req.body.siteUrl;
    const sitemapUrl = req.body.sitemapUrl;
    if (siteUrl || sitemapUrl) indexer.setSiteContext({ siteUrl, sitemapUrl });
    const result = await indexer.googleResubmitSitemap();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// URL Inspection (Google Search Console)
app.post("/api/inspect", auth, async (req, res) => {
  try {
    const url = req.body.url;
    let siteUrlOverride = req.body.siteUrl != null ? String(req.body.siteUrl).trim() || null : null;
    if (!url) return res.status(400).json({ error: "URL required" });
    if (!siteUrlOverride) {
      const site = indexer.resolveSiteForUrl(url);
      if (site && site.siteUrl) siteUrlOverride = site.siteUrl;
    }
    const result = await indexer.inspectUrl(url, siteUrlOverride);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk URL Inspection (Google Search Console)
app.post("/api/inspect/bulk", auth, async (req, res) => {
  try {
    const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
    const siteUrlOverride = req.body.siteUrl || null;
    if (!urls.length) return res.status(400).json({ error: "No URLs provided" });

    const max = Math.min(urls.length, 1000); // simple safety cap
    const results = [];

    for (let i = 0; i < max; i += 1) {
      const url = String(urls[i] || "").trim();
      if (!url) continue;
      try {
        let effectiveSiteUrl = siteUrlOverride;
        // If no explicit siteUrl is provided, try to resolve from saved sites by domain.
        if (!effectiveSiteUrl) {
          const site = indexer.resolveSiteForUrl(url);
          if (site && site.siteUrl) {
            effectiveSiteUrl = site.siteUrl;
          } else if (!siteUrlOverride) {
            results.push({ url, verdict: "ERROR", error: "No matching site configuration for this domain" });
            continue;
          }
        }
        const r = await indexer.inspectUrl(url, effectiveSiteUrl);
        results.push(r);
      } catch (e) {
        results.push({ url, verdict: "ERROR", error: e.message || "Inspection failed" });
      }
      // basic pacing to avoid hammering the API
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    res.json({ success: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk URL Inspection via SERP scraping gateway (external URLs, e.g. Medium)
app.post("/api/inspect/bulk-serp", auth, async (req, res) => {
  try {
    const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
    if (!urls.length) return res.status(400).json({ error: "No URLs provided" });
    if (!String(process.env.SCRAPER_API_KEY || "").trim()) {
      return res.status(400).json({ error: "SCRAPER_API_KEY is not configured on the server" });
    }

    const max = Math.min(urls.length, 500); // safety cap (cost control)
    const results = [];
    const delayMs = Number(req.body.delayMs ?? process.env.SERP_BULK_DELAY_MS ?? 350);
    const timeoutMs = Number(req.body.timeoutMs ?? process.env.SERP_TIMEOUT_MS ?? 30000);

    for (let i = 0; i < max; i += 1) {
      const url = String(urls[i] || "").trim();
      if (!url) continue;
      try {
        const r = await serpInspectUrl(url, { timeoutMs });
        results.push(r);
      } catch (e) {
        results.push({ url, verdict: "ERROR", error: e.message || "SERP inspection failed", checkedBy: "serp" });
      }
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    res.json({ success: true, count: results.length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// SITE REGISTRY (multi-site support)
// ═══════════════════════════════════════

app.get("/api/sites", auth, (req, res) => {
  try {
    res.json({ success: true, sites: indexer.getSites() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/sites/verified", auth, async (req, res) => {
  try {
    const list = await indexer.getGscVerifiedSites();
    res.json({ success: true, verified: list });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/sites", auth, async (req, res) => {
  try {
    const { domain, siteUrl, sitemapUrl } = req.body || {};
    if (!domain || !siteUrl) {
      return res.status(400).json({ error: "domain and siteUrl are required" });
    }
    const ownership = await indexer.isSiteOwned(siteUrl);
    if (!ownership.owned) {
      return res.status(400).json({
        error: ownership.reason || "Only sites you own (verified in Google Search Console) can be added.",
      });
    }
    if (req.app.locals.mongoClient) {
      await db.upsertSite(req.app.locals.mongoClient, { domain, siteUrl, sitemapUrl });
    }
    indexer.upsertSite({ domain, siteUrl, sitemapUrl });
    res.json({ success: true, sites: indexer.getSites() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/sites", auth, async (req, res) => {
  try {
    const domain = req.query.domain || req.body?.domain;
    if (!domain) return res.status(400).json({ error: "domain is required" });
    if (req.app.locals.mongoClient) {
      await db.deleteSite(req.app.locals.mongoClient, domain);
    }
    indexer.deleteSite(domain);
    res.json({ success: true, sites: indexer.getSites() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════
// YOUTUBE (Strategy 9)
// ═══════════════════════════════════════

app.post("/api/youtube/submit", auth, async (req, res) => {
  try {
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs provided" });
    const result = await indexer.submitYouTubeUrls(urls);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/youtube/videos", auth, (req, res) => {
  res.json(indexer.getStoredYouTubeVideos());
});

app.get("/api/youtube/jsonld/:videoId", (req, res) => {
  const videoId = req.params.videoId;
  if (!videoId) return res.status(400).json({ error: "videoId required" });
  res.json(indexer.getVideoJsonLd(videoId));
});

// ─── Dynamic Video Sitemap ───
app.get("/sitemap-video.xml", (req, res) => {
  res.type("application/xml").send(indexer.generateVideoSitemap());
});

// ═══════════════════════════════════════
// ANALYTICS & DATA
// ═══════════════════════════════════════

app.get("/api/stats", auth, (req, res) => {
  res.json(indexer.getStats());
});

app.get("/api/stats/daily", auth, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  res.json(indexer.getDailyStats(days));
});

app.get("/api/history", auth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.service) filter.service = req.query.service;
  if (req.query.url) filter.url = req.query.url;
  res.json(indexer.getHistory(limit, offset, filter));
});

app.get("/api/url-status", auth, (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL required" });
  const status = indexer.getUrlStatus(url);
  res.json(status || { url, status: "not_found" });
});

app.get("/api/service-health", auth, (req, res) => {
  res.json(indexer.getServiceHealth());
});

app.get("/api/indexnow-key", auth, (req, res) => {
  res.json({ key: indexer.getIndexNowKey(), verificationUrl: `${process.env.SITE_URL || "https://yoursite.com"}/${indexer.getIndexNowKey()}.txt` });
});

// ═══════════════════════════════════════
// WEBHOOKS (all with try/catch — FIX)
// ═══════════════════════════════════════

// Generic webhook
app.post("/webhook/generic", auth, async (req, res) => {
  try {
    const urls = req.body.urls || (req.body.url ? [req.body.url] : []);
    if (!urls.length) return res.status(400).json({ error: "No URLs" });
    const results = await indexer.submitAll(urls);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WordPress
app.post("/webhook/wordpress", auth, async (req, res) => {
  try {
    const url = req.body.post_url || req.body.permalink || req.body.guid || req.body.url;
    if (!url) return res.status(400).json({ error: "No URL in payload" });
    const results = await indexer.submitAll([url]);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ghost CMS
app.post("/webhook/ghost", auth, async (req, res) => {
  try {
    const url = req.body.post?.current?.url || req.body.page?.current?.url;
    if (!url) return res.status(400).json({ error: "No URL in Ghost payload" });
    const fullUrl = url.startsWith("http") ? url : `${process.env.SITE_URL}${url}`;
    const results = await indexer.submitAll([fullUrl]);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webflow
app.post("/webhook/webflow", auth, async (req, res) => {
  try {
    const slug = req.body.slug || req.body.data?.slug;
    if (!slug) return res.status(400).json({ error: "No slug in Webflow payload" });
    const fullUrl = `${process.env.SITE_URL}/${slug}`;
    const results = await indexer.submitAll([fullUrl]);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Strapi
app.post("/webhook/strapi", auth, async (req, res) => {
  try {
    const slug = req.body.entry?.slug || req.body.data?.slug;
    if (!slug) return res.status(400).json({ error: "No slug in Strapi payload" });
    const fullUrl = `${process.env.SITE_URL}/${slug}`;
    const results = await indexer.submitAll([fullUrl]);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Netlify deploy
app.post("/webhook/netlify", auth, async (req, res) => {
  try {
    if (req.body.state === "ready" || !req.body.state) {
      const results = await indexer.pingSitemap();
      res.json({ success: true, action: "sitemap_ping", results });
    } else {
      res.json({ success: true, action: "skipped" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Vercel deploy
app.post("/webhook/vercel", auth, async (req, res) => {
  try {
    if (req.body.type === "deployment.succeeded" || !req.body.type) {
      const results = await indexer.pingSitemap();
      res.json({ success: true, action: "sitemap_ping", results });
    } else {
      res.json({ success: true, action: "skipped" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// n8n / Zapier / Make
app.post("/webhook/automation", auth, async (req, res) => {
  try {
    let urls = [];
    if (req.body.urls) urls = req.body.urls;
    else if (req.body.url) urls = [req.body.url];
    else if (req.body.data?.url) urls = [req.body.data.url];
    else if (req.body.items) urls = req.body.items.map((i) => i.url || i.link).filter(Boolean);
    if (!urls.length) return res.status(400).json({ error: "No URLs found in payload" });
    const results = await indexer.submitAll(urls);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Dynamic Recent Sitemap (Strategy 8) ───
app.get("/sitemap-recent.xml", (req, res) => {
  res.type("application/xml").send(indexer.generateRecentSitemap());
});

// ─── IndexNow Key Verification ───
app.get(`/${indexer.getIndexNowKey()}.txt`, (req, res) => {
  res.type("text/plain").send(indexer.getIndexNowKey());
});

// ─── Sitemap Monitor ───
if (process.env.ENABLE_SITEMAP_MONITOR === "true") {
  indexer.monitorSitemap().then(() => console.log("  📡 Sitemap monitoring active"));
}

// ─── Dashboard fallback ───
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dashboard/index.html"));
});

// ─── Start ───
async function start() {
  const mongoUri = (process.env.MONGODB_URI || process.env.MONGODB_URL || process.env.MongoDB_URL || "").trim();
  if (mongoUri) {
    try {
      const mongoClient = await db.connect(mongoUri);
      app.locals.mongoClient = mongoClient;
      const sites = await db.getAllSites(mongoClient);
      indexer.setSites(sites);
      console.log(`  📦 MongoDB connected — ${sites.length} site(s) loaded`);
    } catch (err) {
      console.error("  ⚠ MongoDB connect failed:", err.message);
      console.error("  Sites will use file storage until MONGODB_URI is fixed.");
    }
  }

  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   ⚡  Page Link Indexer v3.1                      ║
  ║   🌐  http://localhost:${PORT}                       ║
  ╠══════════════════════════════════════════════════╣
  ║   9 STRATEGIES • 2026 + YouTube • Sub-1-Hour       ║
  ╠══════════════════════════════════════════════════╣
  ║   Dashboard       →  http://localhost:${PORT}         ║
  ║   API Health      →  /api/health                    ║
  ║   Recent Sitemap  →  /sitemap-recent.xml            ║
  ║   Video Sitemap   →  /sitemap-video.xml             ║
  ║   IndexNow Key    →  ${indexer.getIndexNowKey().substring(0, 24)}…   ║
  ╚══════════════════════════════════════════════════╝
  `);
    const health = indexer.getServiceHealth();
    Object.values(health).forEach((svc) => {
      const icon = svc.status === "operational" ? "✅" : svc.status === "disabled" ? "⏸️" : "⚪";
      console.log(`  ${icon} ${svc.name}: ${svc.status}`);
    });
    console.log("");
  });
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});

module.exports = app;

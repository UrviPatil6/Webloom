/**
 * Page Link Indexer — v3.1 (2026-Compliant Sub-1-Hour Indexing Engine)
 *
 * 9 INDEXING STRATEGIES (all run in parallel):
 * ─────────────────────────────────────────────
 * 1. Google Indexing API          → JobPosting/BroadcastEvent only (2026 policy)
 * 2. IndexNow Protocol            → Bing, Yandex, Seznam, Naver, Yep (5 engines)
 * 3. Bing Webmaster URL Submit     → Direct Bing priority crawl queue
 * 4. WebSub / PubSubHubbub         → Google hub push (triggers immediate crawl)
 * 5. RSS/Atom XML-RPC Ping         → 5 aggregation/ping services (Blog People removed)
 * 6. Sitemap Ping                  → Bing only (Google ping deprecated 2023)
 * 7. Auto Recent Sitemap           → Dynamic /sitemap-recent.xml with <lastmod>
 * 8. YouTube URL submission        → YouTube URLs → IndexNow + Bing for AI search
 *
 * BONUS: Google Search Console sitemap resubmit, URL inspection
 * 2026: No Google sitemap ping; Google Indexing API for structured content only
 */

const { google } = require("googleapis");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

// ─── Service Constants ───

const INDEXNOW_ENGINES = [
  { name: "Bing",   endpoint: "https://api.indexnow.org/indexnow" },
  { name: "Yandex", endpoint: "https://yandex.com/indexnow" },
];

// Legacy ping services are unreliable; keep a single modern endpoint.
const PING_SERVICES = [
  { name: "Ping-o-Matic", url: "https://rpc.pingomatic.com/" },
];

const WEBSUB_HUBS = [
  "https://pubsubhubbub.appspot.com/",
  "https://pubsubhubbub.superfeedr.com/",
];

const STATUS = {
  PENDING: "pending",
  SUCCESS: "success",
  ACCEPTED: "accepted",
  FAILED: "failed",
  SKIPPED: "skipped",
  RATE_LIMITED: "rate_limited",
};

class PageLinkIndexer extends EventEmitter {
  constructor(config = {}) {
    super();
    const computedIndexNowKey = config.indexNowKey || crypto.randomBytes(16).toString("hex");
    this.config = {
      siteUrl: config.siteUrl || null,
      sitemapUrl: config.sitemapUrl || null,
      googleServiceAccountKeyFile: config.googleServiceAccountKeyFile || null,
      googleServiceAccountKey: config.googleServiceAccountKey || null,
      indexNowKeyLocation: config.indexNowKeyLocation || null,

      // Bing Webmaster
      bingApiKey: config.bingApiKey || null,

      // Yandex Webmaster
      yandexAccessToken: config.yandexAccessToken || null,
      yandexUserId: config.yandexUserId || null,
      yandexHostId: config.yandexHostId || null,

      // WebSub
      websubEnabled: config.websubEnabled !== false,

      // RSS Feed
      rssFeedUrl: config.rssFeedUrl || null,

      // 2026: Google Indexing API — use "url_updated" for general URLs, or "job_posting" / "broadcast_event" for structured only
      googleContentType: config.googleContentType || "url_updated",
      // GSC API: exact property string (e.g. https://site.com/ or sc-domain:site.com). If not set, derived from siteUrl.
      gscSiteUrl: config.gscSiteUrl || null,

      // Limits
      googleDailyLimit: config.googleDailyLimit || 200,
      indexNowBatchSize: config.indexNowBatchSize || 10000,
      maxRetries: config.maxRetries || 3,
      retryBaseDelay: config.retryBaseDelay || 1000,
      retryMaxDelay: config.retryMaxDelay || 30000,
      delayBetweenRequests: config.delayBetweenRequests || 600,

      // Storage / history / logging / video sitemap
      dataDir: config.dataDir || path.join(__dirname, "../data"),
      logFile: config.logFile || path.join(__dirname, "../logs/indexer.log"),
      enableHistory: config.enableHistory !== false,
      enableFileLog: config.enableFileLog !== false,
      enableVideoStore: config.enableVideoStore !== false,
      youtubeApiKey: config.youtubeApiKey || process.env.YOUTUBE_API_KEY || null,
      // When true, sites are loaded from MongoDB by the server; do not persist sites to history.json
      useMongoSites: config.useMongoSites === true,

      ...config,
      // Prevent ...config from overwriting computed key (bug fix)
      indexNowKey: config.indexNowKey !== undefined && config.indexNowKey !== "" ? config.indexNowKey : computedIndexNowKey,
    };
    // Ensure paths are never undefined (e.g. when server passes dataDir: process.env.DATA_DIR)
    this.config.dataDir = this.config.dataDir || path.join(__dirname, "../data");
    this.config.logFile = this.config.logFile || path.join(__dirname, "../logs/indexer.log");

    this.googleAuthClient = null;
    this.googleDailyCount = 0;
    this.googleDailyReset = this._today();
    this.sitemapKnownUrls = new Set();
    this.recentUrls = [];
    this.history = [];
    this.urlIndex = new Map();
    this.dailyStats = {};
    this.sites = [];

    this._initDirs();
    this._loadState();
  }

  // ═══════════════════════════════════════
  // INITIALIZATION & PERSISTENCE
  // ═══════════════════════════════════════

  _initDirs() {
    // If history, file logging, and video store are all disabled, avoid creating data/log folders.
    if (!this.config.enableHistory && !this.config.enableFileLog && !this.config.enableVideoStore) return;
    const dirs = [];
    if ((this.config.enableHistory || this.config.enableVideoStore) && this.config.dataDir) {
      dirs.push(this.config.dataDir);
    }
    if (this.config.enableFileLog && this.config.logFile) dirs.push(path.dirname(this.config.logFile));
    dirs.forEach((d) => {
      if (d && !fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
  }

  _loadState() {
    try {
      const p = path.join(this.config.dataDir, "history.json");
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, "utf8"));
        if (this.config.enableHistory) {
          this.history = raw.history || [];
          this.dailyStats = raw.dailyStats || {};
          this.recentUrls = raw.recentUrls || [];
          if (!this.config.useMongoSites) this.sites = Array.isArray(raw.sites) ? raw.sites : [];
          for (const entry of this.history) this._updateUrlIndex(entry);
        } else {
          // Even when history is disabled, keep recentUrls for sitemap-recent if present
          this.recentUrls = raw.recentUrls || [];
          if (!this.config.useMongoSites && Array.isArray(raw.sites)) this.sites = raw.sites;
        }
      }
    } catch (e) {
      this._log("warn", "Fresh state — no history loaded");
    }
  }

  _saveState() {
    try {
      if (!this.config.enableHistory) return;
      if (this.history.length > 5000) this.history = this.history.slice(0, 5000);
      if (this.recentUrls.length > 200) this.recentUrls = this.recentUrls.slice(0, 200);
      const payload = {
          history: this.history,
          dailyStats: this.dailyStats,
          recentUrls: this.recentUrls,
        };
        if (!this.config.useMongoSites) payload.sites = this.sites;
        fs.writeFileSync(
          path.join(this.config.dataDir, "history.json"),
          JSON.stringify(payload, null, 2),
          "utf8"
        );
    } catch { /* silent */ }
  }

  // ═══════════════════════════════════════
  // URL NORMALIZATION & VALIDATION
  // ═══════════════════════════════════════

  normalizeUrl(url) {
    try {
      const u = new URL(url);
      let p = u.pathname;
      if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
      u.pathname = p;
      u.hash = "";
      u.searchParams.sort();
      return u.toString();
    } catch {
      return url;
    }
  }

  deduplicateUrls(urls) {
    const seen = new Set();
    return urls
      .map((u) => this.normalizeUrl(u.trim()))
      .filter((u) => {
        try { new URL(u); } catch { return false; }
        if (seen.has(u)) return false;
        seen.add(u);
        return true;
      });
  }

  // ═══════════════════════════════════════
  // STRATEGY 1: GOOGLE INDEXING API
  // ═══════════════════════════════════════

  async _getGoogleAuth() {
    if (this.googleAuthClient) return this.googleAuthClient;
    let key;
    if (this.config.googleServiceAccountKey) {
      key = typeof this.config.googleServiceAccountKey === "string"
        ? JSON.parse(this.config.googleServiceAccountKey)
        : this.config.googleServiceAccountKey;
    } else if (this.config.googleServiceAccountKeyFile) {
      key = JSON.parse(fs.readFileSync(this.config.googleServiceAccountKeyFile, "utf8"));
    } else {
      throw new Error("Google service account not configured");
    }
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: [
        "https://www.googleapis.com/auth/indexing",
        "https://www.googleapis.com/auth/webmasters",
        "https://www.googleapis.com/auth/webmasters.readonly",
      ],
    });
    this.googleAuthClient = await auth.getClient();
    return this.googleAuthClient;
  }

  _checkGoogleLimit() {
    const today = this._today();
    if (this.googleDailyReset !== today) {
      this.googleDailyCount = 0;
      this.googleDailyReset = today;
    }
    return this.googleDailyCount < this.config.googleDailyLimit;
  }

  async submitToGoogle(urls, type = null) {
    if (!Array.isArray(urls)) urls = [urls];
    const results = [];
    // 2026: Use configured content type (url_updated | job_posting | broadcast_event)
    const notifyType = type || (this.config.googleContentType === "job_posting" ? "JOB_POSTING" : this.config.googleContentType === "broadcast_event" ? "BROADCAST_EVENT" : "URL_UPDATED");
    if (!this._checkGoogleLimit()) {
      return urls.map((url) => this._record(url, "Google Indexing API", STATUS.RATE_LIMITED, { reason: "Daily limit" }));
    }
    try {
      const auth = await this._getGoogleAuth();
      const token = (await auth.getAccessToken()).token;

      if (urls.length >= 3) return await this._googleBatch(urls, notifyType, token);

      for (const url of urls) {
        if (!this._checkGoogleLimit()) {
          results.push(this._record(url, "Google Indexing API", STATUS.RATE_LIMITED));
          continue;
        }
        const r = await this._retry(async () => {
          return await axios.post(
            "https://indexing.googleapis.com/v3/urlNotifications:publish",
            { url, type: notifyType },
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
          );
        }, `Google:${url}`);

        if (r.ok) {
          this.googleDailyCount++;
          results.push(this._record(url, "Google Indexing API", STATUS.SUCCESS, {
            notifyTime: r.data?.data?.urlNotificationMetadata?.latestUpdate?.notifyTime,
          }));
        } else {
          results.push(this._record(url, "Google Indexing API", STATUS.FAILED, { error: r.error, statusCode: r.statusCode }));
        }
        await this._delay(this.config.delayBetweenRequests);
      }
    } catch (authErr) {
      this._log("error", "Google auth failed", { error: authErr.message });
      return urls.map((url) => this._record(url, "Google Indexing API", STATUS.FAILED, { error: authErr.message }));
    }
    return results;
  }

  async _googleBatch(urls, type, token) {
    const results = [];
    for (const chunk of this._chunk(urls, 100)) {
      const boundary = `batch_${crypto.randomBytes(8).toString("hex")}`;
      let body = "";
      const notifyType = type || "URL_UPDATED";
      chunk.forEach((url, i) => {
        body += `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\n`;
        body += `POST /v3/urlNotifications:publish HTTP/1.1\r\nContent-Type: application/json\r\n\r\n`;
        body += JSON.stringify({ url, type: notifyType }) + "\r\n";
      });
      body += `--${boundary}--`;

      const r = await this._retry(async () => {
        return await axios.post("https://indexing.googleapis.com/batch", body, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/mixed; boundary=${boundary}` },
          timeout: 30000,
        });
      }, `GoogleBatch:${chunk.length}`);

      // FIX: Only increment quota on success
      chunk.forEach((url) => {
        if (r.ok) {
          this.googleDailyCount++;
          results.push(this._record(url, "Google Indexing API", STATUS.SUCCESS, { batch: true }));
        } else {
          results.push(this._record(url, "Google Indexing API", STATUS.FAILED, { batch: true, error: r.error }));
        }
      });
      await this._delay(this.config.delayBetweenRequests);
    }
    return results;
  }

  // List sites the user has verified in Google Search Console (for "owned sites only" validation)
  async getGscVerifiedSites() {
    try {
      const auth = await this._getGoogleAuth();
      const token = (await auth.getAccessToken()).token;
      const response = await axios.get("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const entries = response.data?.siteEntry || [];
      return entries.map((e) => ({
        siteUrl: (e.siteUrl || "").trim(),
        permissionLevel: e.permissionLevel || "",
      })).filter((e) => e.siteUrl);
    } catch (err) {
      this._log("warn", "getGscVerifiedSites failed", { error: err.message });
      return [];
    }
  }

  // Check if a given site URL is in the user's GSC verified list (owned)
  _normalizeSiteUrlForCompare(url) {
    if (!url || typeof url !== "string") return "";
    const s = url.trim().toLowerCase();
    if (s.startsWith("sc-domain:")) return s;
    try {
      const u = new URL(s.startsWith("http") ? s : `https://${s}`);
      return u.origin + "/";
    } catch {
      return s;
    }
  }

  async isSiteOwned(siteUrl) {
    const list = await this.getGscVerifiedSites();
    if (!list.length) return { owned: false, reason: "Google Search Console not configured or no verified sites" };
    const normalized = this._normalizeSiteUrlForCompare(siteUrl);
    if (!normalized) return { owned: false, reason: "Invalid site URL" };
    for (const entry of list) {
      const entryNorm = this._normalizeSiteUrlForCompare(entry.siteUrl);
      if (entryNorm === normalized) return { owned: true };
      if (entryNorm.startsWith("sc-domain:")) {
        const domain = entryNorm.replace("sc-domain:", "").trim();
        try {
          const u = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`);
          const host = u.hostname.toLowerCase().replace(/^www\./, "");
          if (host === domain || host.endsWith(`.${domain}`)) return { owned: true };
        } catch { /* ignore */ }
      }
      try {
        const uEntry = new URL(entryNorm.startsWith("http") ? entryNorm : `https://${entryNorm}`);
        const uGiven = new URL(normalized.startsWith("http") ? normalized : `https://${normalized}`);
        if (uEntry.hostname.toLowerCase() === uGiven.hostname.toLowerCase()) return { owned: true };
      } catch { /* ignore */ }
    }
    return { owned: false, reason: "This site is not in your Google Search Console. Only add sites you own and have verified." };
  }

  // Resolve site URL for GSC API (must match Search Console property exactly to avoid 403)
  _getGscSiteUrl() {
    if (this.config.gscSiteUrl) return this.config.gscSiteUrl;
    if (!this.config.siteUrl) return null;
    const s = this.config.siteUrl.trim();
    if (s.startsWith("sc-domain:")) return s;
    try {
      const u = new URL(s);
      return u.origin + "/";
    } catch {
      return s;
    }
  }

  // Google URL Inspection
  async inspectUrl(url, siteUrlOverride = null) {
    try {
      const auth = await this._getGoogleAuth();
      const token = (await auth.getAccessToken()).token;
      const siteUrl = siteUrlOverride || this._getGscSiteUrl();
      if (!siteUrl) throw new Error("siteUrl or gscSiteUrl required");
      const response = await axios.post(
        "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        { inspectionUrl: url, siteUrl },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 }
      );
      const r = response.data?.inspectionResult?.indexStatusResult || {};
      return {
        url,
        verdict: r.verdict || "UNKNOWN",
        coverageState: r.coverageState || "UNKNOWN",
        robotsTxtState: r.robotsTxtState || "UNKNOWN",
        indexingState: r.indexingState || "UNKNOWN",
        lastCrawlTime: r.lastCrawlTime || null,
        pageFetchState: r.pageFetchState || "UNKNOWN",
        crawledAs: r.crawledAs || "UNKNOWN",
        googleCanonical: r.googleCanonical || null,
        userCanonical: r.userCanonical || null,
        siteUrl,
      };
    } catch (error) {
      return { url, verdict: "ERROR", error: error.response?.data?.error?.message || error.message };
    }
  }

  // Google Search Console — force sitemap resubmit
  async googleResubmitSitemap() {
    const siteUrl = this._getGscSiteUrl();
    if (!this.config.sitemapUrl || !siteUrl) return { skipped: true, reason: "Not configured" };
    try {
      const auth = await this._getGoogleAuth();
      const token = (await auth.getAccessToken()).token;
      const feedpath = this.config.sitemapUrl;

      // Delete then re-add sitemap to force fresh crawl
      try {
        await axios.delete(
          `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
      } catch { /* may not exist yet */ }

      await this._delay(500);

      await axios.put(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
        {},
        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
      );

      this._log("info", "GSC: Sitemap resubmitted → triggers fresh crawl");
      return { status: "success", action: "sitemap_resubmitted" };
    } catch (error) {
      const status = error.response?.status;
      const msg = error.response?.data?.error?.message || error.message;
      const hint = status === 403
        ? "Enable 'Google Search Console API' in Cloud Console (APIs & Services → Enable APIs). Ensure SITE_URL matches your property exactly (e.g. https://site.com/ or sc-domain:site.com)."
        : msg;
      this._log("error", "GSC sitemap resubmit failed", { error: msg });
      return { status: "failed", error: msg, hint: status === 403 ? hint : undefined };
    }
  }

  // ═══════════════════════════════════════
  // STRATEGY 2: INDEXNOW PROTOCOL
  // ═══════════════════════════════════════

  async submitToIndexNow(urls) {
    if (!Array.isArray(urls)) urls = [urls];
    if (!this.config.siteUrl) throw new Error("siteUrl required for IndexNow");
    const host = new URL(this.config.siteUrl).hostname;
    const results = [];

    for (const engine of INDEXNOW_ENGINES) {
      for (const batch of this._chunk(urls, this.config.indexNowBatchSize)) {
        const payload = { host, key: this.config.indexNowKey, urlList: batch };
        if (this.config.indexNowKeyLocation) payload.keyLocation = this.config.indexNowKeyLocation;

        const r = await this._retry(async () => {
          return await axios.post(engine.endpoint, payload, {
            headers: { "Content-Type": "application/json; charset=utf-8" },
            timeout: 30000,
            validateStatus: (s) => s >= 200 && s < 300,
          });
        }, `IndexNow:${engine.name}`);

        const status = r.ok || r.statusCode === 202
          ? (r.statusCode === 202 ? STATUS.ACCEPTED : STATUS.SUCCESS)
          : STATUS.FAILED;

        batch.forEach((url) => {
          results.push(this._record(url, `IndexNow → ${engine.name}`, status, {
            statusCode: r.statusCode, error: status === STATUS.FAILED ? r.error : undefined,
          }));
        });
        await this._delay(300);
      }
    }
    return results;
  }

  // ═══════════════════════════════════════
  // STRATEGY 3: BING WEBMASTER URL SUBMIT
  // (Separate from IndexNow — direct API)
  // ═══════════════════════════════════════

  async submitToBingWebmaster(urls) {
    if (!Array.isArray(urls)) urls = [urls];
    if (!this.config.bingApiKey) {
      return [{ service: "Bing Webmaster API", skipped: true, reason: "bingApiKey not configured" }];
    }
    if (!this.config.siteUrl) throw new Error("siteUrl required");

    const results = [];
    for (const batch of this._chunk(urls, 10)) {
      const r = await this._retry(async () => {
        return await axios.post(
          `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${this.config.bingApiKey}`,
          { siteUrl: this.config.siteUrl, urlList: batch },
          { headers: { "Content-Type": "application/json" }, timeout: 15000 }
        );
      }, "BingWebmaster");

      batch.forEach((url) => {
        results.push(this._record(url, "Bing Webmaster API", r.ok ? STATUS.SUCCESS : STATUS.FAILED, {
          error: r.ok ? undefined : r.error,
        }));
      });
      await this._delay(this.config.delayBetweenRequests);
    }
    return results;
  }

  // ═══════════════════════════════════════
  // STRATEGY 4: WEBSUB / PUBSUBHUBBUB
  // Google subscribes to these hubs —
  // pushing here triggers immediate crawl
  // ═══════════════════════════════════════

  async publishToWebSub(urls) {
    if (!this.config.siteUrl) return [{ service: "WebSub", skipped: true }];
    if (!this.config.websubEnabled) return [{ service: "WebSub", skipped: true, reason: "Disabled" }];

    const topicUrl = this.config.rssFeedUrl || this.config.sitemapUrl || this.config.siteUrl;
    const results = [];

    for (const hubUrl of WEBSUB_HUBS) {
      const r = await this._retry(async () => {
        const params = new URLSearchParams();
        params.append("hub.mode", "publish");
        params.append("hub.url", topicUrl);

        return await axios.post(hubUrl, params.toString(), {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
          validateStatus: (s) => s >= 200 && s < 300,
        });
      }, `WebSub:${new URL(hubUrl).hostname}`);

      const hubName = new URL(hubUrl).hostname;
      const status = r.ok || r.statusCode === 204 ? STATUS.SUCCESS : STATUS.FAILED;

      results.push(this._record(
        topicUrl,
        `WebSub → ${hubName}`,
        status,
        { statusCode: r.statusCode, error: status === STATUS.FAILED ? r.error : undefined }
      ));
      await this._delay(300);
    }
    return results;
  }

  // ═══════════════════════════════════════
  // STRATEGY 5: RSS/ATOM XML-RPC PING
  // Pings blog search engines & aggregators
  // ═══════════════════════════════════════

  async pingRSSServices() {
    if (!this.config.siteUrl) return [{ service: "RSS Ping", skipped: true }];

    const siteName = new URL(this.config.siteUrl).hostname;
    const feedUrl = this.config.rssFeedUrl || this.config.sitemapUrl || this.config.siteUrl;
    const results = [];

    for (const service of PING_SERVICES) {
      try {
        const xmlBody = `<?xml version="1.0"?>
<methodCall>
  <methodName>weblogUpdates.ping</methodName>
  <params>
    <param><value>${this._escapeXml(siteName)}</value></param>
    <param><value>${this._escapeXml(this.config.siteUrl)}</value></param>
    <param><value>${this._escapeXml(feedUrl)}</value></param>
  </params>
</methodCall>`;

        const r = await this._retry(async () => {
          return await axios.post(service.url, xmlBody, {
            headers: { "Content-Type": "text/xml" },
            timeout: 10000,
            validateStatus: (s) => s >= 200 && s < 400,
          });
        }, `Ping:${service.name}`);

        results.push(this._record(
          this.config.siteUrl,
          `RSS Ping → ${service.name}`,
          r.ok ? STATUS.SUCCESS : STATUS.FAILED,
          { statusCode: r.statusCode }
        ));
      } catch (error) {
        results.push(this._record(
          this.config.siteUrl,
          `RSS Ping → ${service.name}`,
          STATUS.FAILED,
          { error: error.message }
        ));
      }
      await this._delay(200);
    }
    return results;
  }

  // ═══════════════════════════════════════
  // STRATEGY 7: SITEMAP PING
  // ═══════════════════════════════════════

  async pingSitemap(sitemapUrl = null) {
    const sitemap = sitemapUrl || this.config.sitemapUrl;
    if (!sitemap) throw new Error("Sitemap URL required");
    // Google sitemap ping deprecated Dec 2023 — Bing only (2026 compliant)
    const endpoints = [
      { name: "Bing", url: `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemap)}` },
    ];
    const results = [];
    for (const ep of endpoints) {
      try {
        const res = await axios.get(ep.url, { timeout: 15000 });
        results.push({ engine: ep.name, status: "success", statusCode: res.status });
      } catch (error) {
        results.push({ engine: ep.name, status: "failed", error: error.message });
      }
      await this._delay(300);
    }
    this._incStat("sitemapPings", results.filter((r) => r.status === "success").length);
    return results;
  }

  // ═══════════════════════════════════════
  // STRATEGY 8: AUTO RECENT SITEMAP
  // Dynamic /sitemap-recent.xml with
  // precise <lastmod> + priority=1.0
  // ═══════════════════════════════════════

  _addToRecentUrls(urls) {
    const now = new Date().toISOString();
    for (const url of urls) {
      this.recentUrls = this.recentUrls.filter((e) => e.url !== url);
      this.recentUrls.unshift({ url, lastmod: now });
    }
    if (this.recentUrls.length > 200) this.recentUrls = this.recentUrls.slice(0, 200);
  }

  generateRecentSitemap() {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    for (const entry of this.recentUrls) {
      xml += `  <url>\n    <loc>${this._escapeXml(entry.url)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>always</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;
    }
    xml += `</urlset>`;
    return xml;
  }

  async pingRecentSitemap() {
    if (!this.config.siteUrl) return null;
    const recentSitemapUrl = `${this.config.siteUrl}/sitemap-recent.xml`;
    return await this.pingSitemap(recentSitemapUrl);
  }

  // ═══════════════════════════════════════
  // COMBINED: SUBMIT ALL (PARALLEL BLAST)
  // ═══════════════════════════════════════

  async submitAll(urls, options = {}) {
    if (!Array.isArray(urls)) urls = [urls];
    urls = this.deduplicateUrls(urls);
    if (!urls.length) return { error: "No valid URLs" };

    const startTime = Date.now();
    this._log("info", `⚡ Submitting ${urls.length} URL(s) to ALL services`);
    this.emit("submit:start", { urls });

    // Track in recent sitemap
    this._addToRecentUrls(urls);

    const results = {
      id: crypto.randomBytes(8).toString("hex"),
      timestamp: new Date().toISOString(),
      urlCount: urls.length,
      urls,
      services: {},
      summary: { total: 0, success: 0, failed: 0, accepted: 0, skipped: 0 },
    };

    // Default set for "Submit to All Services" — sitemap pings are available
    // via quick actions only to avoid noisy failures.
    const ALL_SERVICES = [
      "google", "indexnow", "bing_webmaster",
      "websub", "rss_ping", "youtube",
    ];
    const svcs = options.services || ALL_SERVICES;

    // ── GROUP 1: Direct API submissions (run in PARALLEL) ──
    const directTasks = [];

    if (svcs.includes("google") && (this.config.googleServiceAccountKeyFile || this.config.googleServiceAccountKey)) {
      directTasks.push(
        this.submitToGoogle(urls)
          .then((r) => { results.services.google = r; })
          .catch((e) => { results.services.google = { error: e.message }; })
      );
    } else if (svcs.includes("google")) {
      results.services.google = { skipped: true, reason: "Not configured" };
    }

    if (svcs.includes("indexnow") && this.config.siteUrl) {
      directTasks.push(
        this.submitToIndexNow(urls)
          .then((r) => { results.services.indexNow = r; })
          .catch((e) => { results.services.indexNow = { error: e.message }; })
      );
    } else if (svcs.includes("indexnow")) {
      results.services.indexNow = { skipped: true, reason: "siteUrl not configured" };
    }

    if (svcs.includes("bing_webmaster") && this.config.bingApiKey) {
      directTasks.push(
        this.submitToBingWebmaster(urls)
          .then((r) => { results.services.bingWebmaster = r; })
          .catch((e) => { results.services.bingWebmaster = { error: e.message }; })
      );
    } else if (svcs.includes("bing_webmaster")) {
      results.services.bingWebmaster = { skipped: true, reason: "bingApiKey not configured" };
    }

    if (svcs.includes("youtube")) {
      directTasks.push(
        this.submitYouTubeUrls(urls)
          .then((r) => { results.services.youtube = r; })
          .catch((e) => { results.services.youtube = { error: e.message }; })
      );
    }

    // Wait for all direct APIs in parallel
    await Promise.allSettled(directTasks);

    // ── GROUP 2: Notification/ping services (parallel) ──
    const notifyTasks = [];

    if (svcs.includes("websub") && this.config.websubEnabled) {
      notifyTasks.push(
        this.publishToWebSub(urls)
          .then((r) => { results.services.webSub = r; })
          .catch((e) => { results.services.webSub = { error: e.message }; })
      );
    } else if (svcs.includes("websub")) {
      results.services.webSub = { skipped: true, reason: "Disabled" };
    }

    if (svcs.includes("rss_ping")) {
      notifyTasks.push(
        this.pingRSSServices()
          .then((r) => { results.services.rssPing = r; })
          .catch((e) => { results.services.rssPing = { error: e.message }; })
      );
    }

    if (svcs.includes("sitemap") && this.config.sitemapUrl) {
      notifyTasks.push(
        this.pingSitemap()
          .then((r) => { results.services.sitemapPing = r; })
          .catch((e) => { results.services.sitemapPing = { error: e.message }; })
      );
    } else if (svcs.includes("sitemap")) {
      results.services.sitemapPing = { skipped: true, reason: "sitemapUrl not configured" };
    }

    if (svcs.includes("recent_sitemap") && this.config.siteUrl) {
      notifyTasks.push(
        this.pingRecentSitemap()
          .then((r) => { results.services.recentSitemap = r; })
          .catch((e) => { results.services.recentSitemap = { error: e.message }; })
      );
    }

    await Promise.allSettled(notifyTasks);

    // ── BONUS: GSC sitemap resubmit ──
    if (svcs.includes("google") && (this.config.googleServiceAccountKeyFile || this.config.googleServiceAccountKey)) {
      try {
        results.services.gscSitemapResubmit = await this.googleResubmitSitemap();
      } catch (e) {
        results.services.gscSitemapResubmit = { error: e.message };
      }
    }

    // ── Compute summary ──
    for (const entries of Object.values(results.services)) {
      if (Array.isArray(entries)) {
        for (const e of entries) {
          results.summary.total++;
          if (e.status === STATUS.SUCCESS) results.summary.success++;
          else if (e.status === STATUS.ACCEPTED) results.summary.accepted++;
          else if (e.status === STATUS.FAILED) results.summary.failed++;
          else results.summary.skipped++;
        }
      }
    }

    this._saveState();
    this.emit("submit:complete", results);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this._log("info", `✅ All ${Object.keys(results.services).length} services complete in ${elapsed}s — ${results.summary.success} success, ${results.summary.failed} failed`);

    return results;
  }

  // ═══════════════════════════════════════
  // SITEMAP MONITOR
  // ═══════════════════════════════════════

  async monitorSitemap(intervalMs = 5 * 60 * 1000) {
    if (!this.config.sitemapUrl) throw new Error("sitemapUrl required");
    const check = async () => {
      try {
        const response = await axios.get(this.config.sitemapUrl, { timeout: 30000 });
        const currentUrls = new Set();
        let m;
        const re = /<loc>(.*?)<\/loc>/g;
        while ((m = re.exec(response.data)) !== null) currentUrls.add(this.normalizeUrl(m[1]));

        const newUrls = [...currentUrls].filter((u) => !this.sitemapKnownUrls.has(u));
        if (newUrls.length > 0 && this.sitemapKnownUrls.size > 0) {
          this._log("info", `🔍 Sitemap: ${newUrls.length} new URL(s) detected`);
          this.emit("sitemap:newUrls", newUrls);
          await this.submitAll(newUrls);
        }
        this.sitemapKnownUrls = currentUrls;
      } catch (error) {
        this._log("error", "Sitemap monitor error", { error: error.message });
      }
    };

    await check();
    const interval = setInterval(check, intervalMs);
    this._log("info", `📡 Sitemap monitor active (every ${intervalMs / 1000}s)`);
    return () => clearInterval(interval);
  }

  // ═══════════════════════════════════════
  // RETRY WITH EXPONENTIAL BACKOFF (FIXED)
  // ═══════════════════════════════════════

  async _retry(fn, label = "") {
    for (let i = 0; i <= this.config.maxRetries; i++) {
      try {
        const response = await fn();
        return { ok: true, data: response, statusCode: response.status, attempts: i + 1 };
      } catch (error) {
        const sc = error.response?.status;
        if (sc === 202 || sc === 204) return { ok: true, statusCode: sc, attempts: i + 1 };
        const retryable = !sc || [429, 500, 502, 503].includes(sc);
        if (i < this.config.maxRetries && retryable) {
          const delay = Math.min(this.config.retryBaseDelay * Math.pow(2, i) + Math.random() * 500, this.config.retryMaxDelay);
          this._log("warn", `Retry ${i + 1}/${this.config.maxRetries} for ${label}`, { delay: Math.round(delay) });
          await this._delay(delay);
          continue;
        }
        return { ok: false, error: error.response?.data?.error?.message || error.message, statusCode: sc, attempts: i + 1 };
      }
    }
    // FIX: Safety return — previous version could return undefined
    return { ok: false, error: "Max retries exceeded", attempts: this.config.maxRetries + 1 };
  }

  // ═══════════════════════════════════════
  // RECORDING & ANALYTICS
  // ═══════════════════════════════════════

  _record(url, service, status, details = {}) {
    const entry = {
      id: crypto.randomBytes(6).toString("hex"),
      url, service, status,
      timestamp: new Date().toISOString(),
      ...details,
    };
    if (this.config.enableHistory) {
      this.history.unshift(entry);
      this._updateUrlIndex(entry);
      this._incStat(status === STATUS.SUCCESS || status === STATUS.ACCEPTED ? "success" : "failed");
    }
    this.emit("url:indexed", entry);
    return entry;
  }

  _updateUrlIndex(entry) {
    if (!this.urlIndex.has(entry.url)) {
      this.urlIndex.set(entry.url, { url: entry.url, firstSubmitted: entry.timestamp, lastSubmitted: entry.timestamp, services: {}, totalAttempts: 0 });
    }
    const idx = this.urlIndex.get(entry.url);
    idx.lastSubmitted = entry.timestamp;
    idx.totalAttempts++;
    idx.services[entry.service] = { status: entry.status, timestamp: entry.timestamp };
  }

  _incStat(key, count = 1) {
    const day = this._today();
    if (!this.dailyStats[day]) this.dailyStats[day] = { date: day, submitted: 0, success: 0, failed: 0, sitemapPings: 0 };
    this.dailyStats[day][key] = (this.dailyStats[day][key] || 0) + count;
    this.dailyStats[day].submitted += count;
  }

  // ═══════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════

  getHistory(limit = 100, offset = 0, filter = {}) {
    let entries = this.history;
    if (filter.status) entries = entries.filter((e) => e.status === filter.status);
    if (filter.service) entries = entries.filter((e) => e.service.includes(filter.service));
    if (filter.url) entries = entries.filter((e) => e.url.includes(filter.url));
    return { entries: entries.slice(offset, offset + limit), total: entries.length };
  }

  getUrlStatus(url) {
    return this.urlIndex.get(this.normalizeUrl(url)) || null;
  }

  getStats() {
    const today = this._today();
    const ts = this.dailyStats[today] || { submitted: 0, success: 0, failed: 0, sitemapPings: 0 };
    const allSuccess = this.history.filter((e) => e.status === STATUS.SUCCESS || e.status === STATUS.ACCEPTED).length;
    const allFailed = this.history.filter((e) => e.status === STATUS.FAILED).length;
    return {
      today: ts,
      allTime: { totalSubmissions: this.history.length, success: allSuccess, failed: allFailed, uniqueUrls: this.urlIndex.size, successRate: this.history.length > 0 ? Math.round((allSuccess / this.history.length) * 100) : 0 },
      google: { dailyUsed: this.googleDailyCount, dailyLimit: this.config.googleDailyLimit, remaining: this.config.googleDailyLimit - this.googleDailyCount, configured: !!(this.config.googleServiceAccountKeyFile || this.config.googleServiceAccountKey) },
      indexNow: { configured: !!this.config.siteUrl, engines: INDEXNOW_ENGINES.map((e) => e.name) },
      bingWebmaster: { configured: !!this.config.bingApiKey },
      webSub: { enabled: this.config.websubEnabled, hubs: WEBSUB_HUBS.length },
      rssPing: { services: PING_SERVICES.length },
      sitemap: { url: this.config.sitemapUrl, configured: !!this.config.sitemapUrl, trackedUrls: this.sitemapKnownUrls.size },
      recentSitemap: { urlCount: this.recentUrls.length },
    };
  }

  getDailyStats(days = 30) {
    const result = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      result.push(this.dailyStats[key] || { date: key, submitted: 0, success: 0, failed: 0, sitemapPings: 0 });
    }
    return result;
  }

  getServiceHealth() {
    const gc = !!(this.config.googleServiceAccountKeyFile || this.config.googleServiceAccountKey);
    return {
      google: { name: "Google Indexing API", configured: gc, remaining: this.config.googleDailyLimit - this.googleDailyCount, status: gc ? (this.googleDailyCount < this.config.googleDailyLimit ? "operational" : "rate_limited") : "not_configured" },
      indexNow: { name: "IndexNow (2 engines)", configured: !!this.config.siteUrl, engines: INDEXNOW_ENGINES.length, status: this.config.siteUrl ? "operational" : "not_configured" },
      bingWebmaster: { name: "Bing Webmaster API", configured: !!this.config.bingApiKey, status: this.config.bingApiKey ? "operational" : "not_configured" },
      webSub: { name: "WebSub/PubSubHubbub", configured: this.config.websubEnabled, hubs: WEBSUB_HUBS.length, status: this.config.websubEnabled ? "operational" : "disabled" },
      rssPing: { name: "RSS/XML-RPC Ping", configured: true, services: PING_SERVICES.length, status: "operational" },
      sitemap: { name: "Sitemap Ping (Bing)", configured: !!this.config.sitemapUrl, status: this.config.sitemapUrl ? "operational" : "not_configured" },
      recentSitemap: { name: "Recent Sitemap", configured: !!this.config.siteUrl, urlCount: this.recentUrls.length, status: this.config.siteUrl ? "operational" : "not_configured" },
      youtube: { name: "YouTube (IndexNow+Bing)", configured: !!this.config.siteUrl, status: this.config.siteUrl ? "operational" : "not_configured" },
    };
  }

  getIndexNowKey() { return this.config.indexNowKey; }
  getRecentUrls() { return this.recentUrls; }

  // Site registry: store per-domain configs to support multi-site workflows.
  getSites() {
    return Array.isArray(this.sites) ? this.sites : [];
  }

  setSites(sites) {
    this.sites = Array.isArray(sites) ? sites : [];
  }

  upsertSite(site) {
    if (!site || !site.domain || !site.siteUrl) return;
    const domain = String(site.domain).trim().toLowerCase();
    const existingIdx = this.sites.findIndex((s) => (s.domain || "").toLowerCase() === domain);
    const record = {
      domain,
      siteUrl: String(site.siteUrl || "").trim(),
      sitemapUrl: site.sitemapUrl ? String(site.sitemapUrl).trim() : "",
    };
    if (existingIdx >= 0) {
      this.sites[existingIdx] = { ...this.sites[existingIdx], ...record };
    } else {
      this.sites.push(record);
    }
    this._saveState();
  }

  deleteSite(domain) {
    if (!domain || !this.sites || !this.sites.length) return;
    const key = String(domain).trim().toLowerCase();
    const idx = this.sites.findIndex((s) => (s.domain || "").toLowerCase() === key);
    if (idx >= 0) {
      this.sites.splice(idx, 1);
      this._saveState();
    }
  }

  resolveSiteForUrl(rawUrl) {
    if (!rawUrl || !this.sites || !this.sites.length) return null;
    let host = "";
    try {
      const u = new URL(rawUrl);
      host = u.hostname.toLowerCase();
    } catch {
      return null;
    }
    // Find the most specific matching domain (suffix match)
    let best = null;
    for (const s of this.sites) {
      const d = (s.domain || "").toLowerCase();
      if (!d) continue;
      if (host === d || host.endsWith(`.${d}`)) {
        if (!best || d.length > best.domain.length) {
          best = s;
        }
      }
    }
    return best;
  }

  // Allow per-request site context overrides (for multi-site workflows)
  setSiteContext(ctx = {}) {
    if (ctx.siteUrl) this.config.siteUrl = ctx.siteUrl;
    if (ctx.sitemapUrl) this.config.sitemapUrl = ctx.sitemapUrl;
    if (ctx.gscSiteUrl) this.config.gscSiteUrl = ctx.gscSiteUrl;
  }

  // ═══════════════════════════════════════
  // STRATEGY 9: YOUTUBE URL SUBMISSION
  // Submit YouTube URLs to IndexNow + Bing for AI/search coverage
  // ═══════════════════════════════════════

  static isYouTubeUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "youtube.com" && host !== "www.youtube.com" && host !== "youtu.be" && host !== "m.youtube.com") return false;
      if (host === "youtu.be") return !!u.pathname.replace(/\//g, "").trim();
      return /^\/(watch|shorts|embed|live)\//.test(u.pathname) || u.searchParams.has("v");
    } catch { return false; }
  }

  static extractYouTubeVideoId(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") {
        return u.pathname.replace(/^\//, "").split("/")[0] || null;
      }
      // Standard watch URLs: https://www.youtube.com/watch?v=ID
      const vidParam = u.searchParams.get("v");
      if (vidParam) return vidParam;
      // Shorts: https://www.youtube.com/shorts/ID
      const path = u.pathname.replace(/^\/+/, "");
      if (path.toLowerCase().startsWith("shorts/")) {
        const parts = path.split("/");
        return parts[1] || null;
      }
      // Embeds: https://www.youtube.com/embed/ID
      if (path.toLowerCase().startsWith("embed/")) {
        const parts = path.split("/");
        return parts[1] || null;
      }
      return null;
    } catch { return null; }
    }

  extractYouTubeUrls(urls) {
    if (!Array.isArray(urls)) urls = [urls];
    return urls.filter((u) => PageLinkIndexer.isYouTubeUrl(this.normalizeUrl(u)));
  }

  async submitYouTubeUrls(urls) {
    const youtubeUrls = this.extractYouTubeUrls(urls);
    if (!youtubeUrls.length) return { skipped: true, reason: "No YouTube URLs", results: [] };
    if (!this.config.siteUrl) return { skipped: true, reason: "siteUrl required", results: [] };

    const results = { submitted: youtubeUrls.length, indexNow: null, bingWebmaster: null };
    const ids = youtubeUrls.map((u) => PageLinkIndexer.extractYouTubeVideoId(u)).filter(Boolean);
    this._addToRecentUrls(youtubeUrls);
    this._storeYouTubeIds(ids);

    const indexNowRes = await this.submitToIndexNow(youtubeUrls);
    results.indexNow = indexNowRes;
    if (this.config.bingApiKey) {
      const bingRes = await this.submitToBingWebmaster(youtubeUrls);
      results.bingWebmaster = bingRes;
    }
    return results;
  }

  async _storeYouTubeIds(ids) {
    if (!this.config.enableVideoStore || !this.config.dataDir) return;
    const p = path.join(this.config.dataDir, "youtube-videos.json");
    let list = [];
    try {
      if (fs.existsSync(p)) list = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch { }
    // Normalize existing list to objects
    const seen = new Set();
    list = Array.isArray(list) ? list.map((item) => {
      if (typeof item === "string") return { id: item, added: new Date().toISOString() };
      return item;
    }) : [];
    list.forEach((v) => { if (v && v.id) seen.add(v.id); });

    const newIds = ids.filter((id) => id && !seen.has(id));

    // Fetch metadata from YouTube Data API when configured
    let meta = [];
    if (this.config.youtubeApiKey && newIds.length) {
      try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${newIds.join(",")}&key=${this.config.youtubeApiKey}`;
        const res = await axios.get(url, { timeout: 10000 });
        meta = (res.data?.items || []).map((item) => ({
          id: item.id,
          title: item.snippet?.title || `Video ${item.id}`,
          description: item.snippet?.description || "",
          thumbnail: item.snippet?.thumbnails?.maxres?.url
                  || item.snippet?.thumbnails?.high?.url
                  || item.snippet?.thumbnails?.medium?.url
                  || item.snippet?.thumbnails?.default?.url
                  || `https://img.youtube.com/vi/${item.id}/maxresdefault.jpg`,
          duration: item.contentDetails?.duration || null,
          added: new Date().toISOString(),
        }));
      } catch (e) {
        this._log("warn", "YouTube Data API fetch failed; falling back to basic IDs", { error: e.message });
      }
    }

    const metaById = new Map();
    meta.forEach((v) => { metaById.set(v.id, v); });

    newIds.forEach((id) => {
      const v = metaById.get(id) || {
        id,
        title: `Video ${id}`,
        description: "",
        thumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
        duration: null,
        added: new Date().toISOString(),
      };
      list.push(v);
      seen.add(id);
    });

    if (list.length > 500) list = list.slice(-500);
    try { fs.writeFileSync(p, JSON.stringify(list, null, 2), "utf8"); } catch { }
  }

  getStoredYouTubeVideos() {
    const p = path.join(this.config.dataDir, "youtube-videos.json");
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch { }
    return [];
  }

  generateVideoSitemap() {
    const base = this.config.siteUrl || "https://yoursite.com";
    const videos = this.getStoredYouTubeVideos();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
      `xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n`;

    const toSeconds = (iso) => {
      if (!iso || typeof iso !== "string" || !iso.startsWith("PT")) return null;
      let h = 0, m = 0, s = 0;
      const re = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
      const mRes = re.exec(iso);
      if (mRes) {
        if (mRes[1]) h = parseInt(mRes[1], 10);
        if (mRes[2]) m = parseInt(mRes[2], 10);
        if (mRes[3]) s = parseInt(mRes[3], 10);
      }
      const total = h * 3600 + m * 60 + s;
      return total || null;
    };

    for (const v of videos) {
      if (!v || !v.id) continue;
      const id = v.id;
      const title = this._escapeXml(v.title || `Video ${id}`);
      const desc = this._escapeXml((v.description || "").slice(0, 2048) || `Video ${id} from YouTube`);
      const thumb = this._escapeXml(
        v.thumbnail || `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
      );
      const watchUrl = `https://www.youtube.com/watch?v=${id}`;
      const durationSeconds = toSeconds(v.duration);

      xml += `  <url>\n` +
             `    <loc>${this._escapeXml(base)}</loc>\n` +
             `    <video:video>\n` +
             `      <video:thumbnail_loc>${thumb}</video:thumbnail_loc>\n` +
             `      <video:title>${title}</video:title>\n` +
             `      <video:description>${desc}</video:description>\n` +
             `      <video:player_loc>${this._escapeXml(watchUrl)}</video:player_loc>\n`;
      if (durationSeconds) {
        xml += `      <video:duration>${durationSeconds}</video:duration>\n`;
      }
      xml += `    </video:video>\n` +
             `  </url>\n`;
    }
    xml += `</urlset>`;
    return xml;
  }

  getVideoJsonLd(videoId) {
    const videos = this.getStoredYouTubeVideos();
    const meta = videos.find((v) => v && v.id === videoId) || {};
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: meta.title || `Video ${videoId}`,
      description: meta.description || "YouTube video",
      thumbnailUrl: meta.thumbnail || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      uploadDate: (meta.added || new Date().toISOString()).split("T")[0],
      contentUrl: watchUrl,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    };
  }

  // ═══════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════

  _today() { return new Date().toISOString().split("T")[0]; }
  _chunk(arr, size) { const c = []; for (let i = 0; i < arr.length; i += size) c.push(arr.slice(i, i + size)); return c; }
  _delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
  _escapeXml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  _log(level, msg, data = {}) {
    const icon = level === "error" ? "❌" : level === "warn" ? "⚠️" : "✓";
    console.log(`  ${icon} [${level.toUpperCase()}] ${msg}`, Object.keys(data).length ? data : "");
    if (this.config.enableFileLog && this.config.logFile) {
      try {
        fs.appendFileSync(
          this.config.logFile,
          JSON.stringify({ t: new Date().toISOString(), level, msg, ...data }) + "\n",
          "utf8"
        );
      } catch { /* ignore file log errors */ }
    }
  }
}

module.exports = PageLinkIndexer;
module.exports.STATUS = STATUS;
module.exports.INDEXNOW_ENGINES = INDEXNOW_ENGINES;
module.exports.WEBSUB_HUBS = WEBSUB_HUBS;
module.exports.PING_SERVICES = PING_SERVICES;

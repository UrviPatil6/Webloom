/**
 * SERP-based "indexed?" checker via a scraping gateway.
 *
 * Default integration targets ScraperAPI-style gateway:
 *   GET https://api.scraperapi.com/?api_key=KEY&url=ENCODED_TARGET_URL
 *
 * Configure:
 * - SCRAPER_API_KEY (required)
 * - SCRAPER_API_BASE_URL (optional; default https://api.scraperapi.com/)
 * - SERP_UA (optional)
 */

const axios = require("axios");

function normalizeUrl(input) {
  try {
    const u = new URL(String(input).trim());
    u.hash = "";
    // keep query (sometimes canonical includes it), but normalize common tracking?
    // For safety, keep it.
    let s = u.toString();
    // normalize trailing slash
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return String(input || "").trim();
  }
}

function extractResultUrlsFromGoogleHtml(html) {
  const out = [];
  const text = String(html || "");

  // Common Google SERP pattern: /url?q=<target>&sa=...
  const re = /\/url\?q=([^&"']+)/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      const url = decodeURIComponent(m[1]);
      if (url && /^https?:\/\//i.test(url)) out.push(url);
    } catch {
      // ignore
    }
  }
  return out;
}

function looksLikeBlocked(html) {
  const t = String(html || "").toLowerCase();
  return (
    t.includes("unusual traffic") ||
    t.includes("/sorry/") ||
    t.includes("recaptcha") ||
    t.includes("detected unusual traffic")
  );
}

async function fetchThroughScraperGateway(targetUrl, { timeoutMs = 30000 } = {}) {
  const apiKey = (process.env.SCRAPER_API_KEY || "").trim();
  if (!apiKey) throw new Error("SCRAPER_API_KEY is not configured");

  const base = (process.env.SCRAPER_API_BASE_URL || "https://api.scraperapi.com/").trim();
  const headers = {};
  const ua = (process.env.SERP_UA || "").trim();
  if (ua) headers["User-Agent"] = ua;

  // ScraperAPI-style
  const res = await axios.get(base, {
    params: { api_key: apiKey, url: targetUrl },
    timeout: Number(timeoutMs) || 30000,
    headers,
    responseType: "text",
    transformResponse: [(d) => d], // keep raw string
    validateStatus: () => true,
  });

  if (res.status >= 400) {
    throw new Error(`Scraper gateway failed: HTTP ${res.status}`);
  }

  return String(res.data || "");
}

/**
 * Check whether a URL appears indexed by querying Google.
 * Returns a result shaped similarly to GSC inspect results (so the UI can render).
 */
async function serpInspectUrl(url, { timeoutMs = 30000 } = {}) {
  const original = String(url || "").trim();
  if (!/^https?:\/\//i.test(original)) {
    return { url: original, verdict: "ERROR", error: "Invalid URL" };
  }

  const norm = normalizeUrl(original);
  const host = (() => {
    try {
      return new URL(original).hostname;
    } catch {
      return null;
    }
  })();

  // Query: site:<host> "<full url>"
  const q = host ? `site:${host} "${norm}"` : `"${norm}"`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en&num=10&pws=0`;

  const html = await fetchThroughScraperGateway(googleUrl, { timeoutMs });
  if (looksLikeBlocked(html)) {
    return {
      url: original,
      verdict: "ERROR",
      indexingState: "Blocked (SERP)",
      coverageState: "—",
      lastCrawlTime: null,
      robotsTxtState: "—",
      pageFetchState: "—",
      error: "Google blocked/CAPTCHA page detected",
      checkedBy: "serp",
    };
  }

  const candidates = extractResultUrlsFromGoogleHtml(html).map(normalizeUrl);
  const found = candidates.includes(norm);

  return {
    url: original,
    verdict: found ? "PASS" : "FAIL",
    indexingState: found ? "Indexed (SERP)" : "Not indexed (SERP)",
    coverageState: "—",
    lastCrawlTime: null,
    robotsTxtState: "—",
    pageFetchState: "—",
    checkedBy: "serp",
  };
}

module.exports = { serpInspectUrl };


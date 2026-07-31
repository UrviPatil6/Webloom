/**
 * URL Shorteners (2026)
 *
 * Notes (important / reality-checked):
 * - TinyURL + is.gd + v.gd return plain text short URLs.
 * - Cutt.ly requires an API key and returns JSON.
 * - 1pt.one returns JSON (per their public docs).
 *
 * This module exposes:
 * - getRandomShortLink(longUrl, opts)
 * - bulkShorten(longUrls, opts)
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isProbablyUrl(s) {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(t);
    return true;
  } catch {
    return false;
  }
}

function isVerbose(opts) {
  if (opts && typeof opts.verbose === "boolean") return opts.verbose;
  const v = String(process.env.SHORTEN_VERBOSE || "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function fetchWithTimeout(url, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? 15000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error("Request timeout")), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      ...opts,
      signal: controller.signal,
      headers: {
        // Be a good citizen; many services block empty UA
        "user-agent": "page-link-indexer/3.1 (+https://localhost)",
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function readTextTrim(res) {
  const text = (await res.text()).trim();
  return text;
}

async function readJsonSafe(res) {
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error("Invalid JSON response");
    err.cause = e;
    err.raw = raw;
    throw err;
  }
}

const providers = [
  {
    name: "TinyURL",
    async shorten(longUrl, opts = {}) {
      const res = await fetchWithTimeout(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`,
        { timeoutMs: opts.timeoutMs }
      );
      if (!res.ok) throw new Error(`TinyURL failed: ${res.status}`);
      return await readTextTrim(res);
    },
  },
  {
    name: "is.gd",
    async shorten(longUrl, opts = {}) {
      const res = await fetchWithTimeout(
        `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
        { timeoutMs: opts.timeoutMs }
      );
      if (!res.ok) throw new Error(`is.gd failed: ${res.status}`);
      const out = await readTextTrim(res);
      if (/^error:/i.test(out)) throw new Error(`is.gd error: ${out}`);
      return out;
    },
  },
  {
    name: "v.gd",
    async shorten(longUrl, opts = {}) {
      const res = await fetchWithTimeout(
        `https://v.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`,
        { timeoutMs: opts.timeoutMs }
      );
      if (!res.ok) throw new Error(`v.gd failed: ${res.status}`);
      const out = await readTextTrim(res);
      if (/^error:/i.test(out)) throw new Error(`v.gd error: ${out}`);
      return out;
    },
  },
  {
    name: "1pt.one",
    async shorten(longUrl, opts = {}) {
      // Docs: https://github.com/Jeusto/1pt.one
      const res = await fetchWithTimeout(
        `https://1pt.one/shorten?long=${encodeURIComponent(longUrl)}`,
        { timeoutMs: opts.timeoutMs }
      );
      if (!res.ok) throw new Error(`1pt.one failed: ${res.status}`);
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const data = await readJsonSafe(res);
        const code = data?.status || data?.code;
        if (code && Number(code) >= 400) throw new Error(`1pt.one error: ${data?.message || code}`);
        const slug = data?.short_url || data?.shortUrl || data?.short;
        if (!slug) throw new Error("1pt.one response missing short_url");
        return `https://1pt.one/${String(slug).trim()}`;
      }
      // Fallback: try to treat as plain text
      const out = await readTextTrim(res);
      if (isProbablyUrl(out)) return out;
      throw new Error("1pt.one returned unexpected response");
    },
  },
  {
    name: "Cutt.ly",
    async shorten(longUrl, opts = {}) {
      const key = opts.cuttlyApiKey || process.env.CUTTLY_API_KEY;
      if (!key) throw new Error("Cutt.ly requires CUTTLY_API_KEY");
      const res = await fetchWithTimeout(
        `https://cutt.ly/api/api.php?key=${encodeURIComponent(key)}&short=${encodeURIComponent(longUrl)}`,
        { timeoutMs: opts.timeoutMs }
      );
      if (!res.ok) throw new Error(`Cutt.ly failed: ${res.status}`);
      const data = await readJsonSafe(res);
      const urlData = data?.url || data?.result || data;
      const shortLink = urlData?.shortLink || urlData?.short_link || urlData?.shortUrl || urlData?.link;
      const status = urlData?.status;
      // Official docs: status 7 means OK. Other statuses are errors.
      if (status !== undefined && Number(status) !== 7) {
        throw new Error(`Cutt.ly error status: ${status}`);
      }
      if (!shortLink) throw new Error("Cutt.ly response missing shortLink");
      return String(shortLink).trim();
    },
  },
];

/**
 * Try providers in random order (first successful wins).
 * @param {string} longUrl
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.cuttlyApiKey]
 * @returns {Promise<string>}
 */
async function getRandomShortLink(longUrl, opts = {}) {
  if (!longUrl || typeof longUrl !== "string" || !longUrl.startsWith("http")) {
    throw new Error("Invalid longUrl (must start with http)");
  }

  const shuffled = shuffle(providers);
  const errors = [];
  const verbose = isVerbose(opts);

  for (const p of shuffled) {
    try {
      if (verbose) console.log(`[shorten] trying ${p.name}…`);
      const short = await p.shorten(longUrl, opts);
      if (isProbablyUrl(short)) {
        const out = short.trim();
        if (verbose) console.log(`[shorten] ok via ${p.name}: ${out}`);
        return out;
      }
      throw new Error(`${p.name} returned invalid URL`);
    } catch (e) {
      if (verbose) console.log(`[shorten] fail via ${p.name}: ${e?.message || String(e)}`);
      errors.push(`${p.name}: ${e?.message || String(e)}`);
    }
  }

  const err = new Error(`All shorteners failed for: ${longUrl}`);
  err.details = errors;
  throw err;
}

/**
 * Bulk shorten many URLs with delay & retry.
 * @param {string[]} longUrls
 * @param {object} [opts]
 * @param {number} [opts.delayMinMs]
 * @param {number} [opts.delayMaxMs]
 * @param {number} [opts.maxRetries]
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.cuttlyApiKey]
 * @returns {Promise<Array<{original: string, short: (string|null)}>>}
 */
async function bulkShorten(
  longUrls,
  {
    delayMinMs = 1500,
    delayMaxMs = 4500,
    maxRetries = 2,
    timeoutMs = 15000,
    cuttlyApiKey,
    verbose,
  } = {}
) {
  if (!Array.isArray(longUrls)) throw new Error("longUrls must be an array");

  const results = [];
  let success = 0;
  const v = isVerbose({ verbose });
  let idx = 0;

  for (const url of longUrls) {
    let short = null;
    idx++;
    if (v) console.log(`[shorten] ${idx}/${longUrls.length}: ${url}`);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (v && maxRetries > 1) console.log(`[shorten] attempt ${attempt}/${maxRetries}`);
        short = await getRandomShortLink(url, { timeoutMs, cuttlyApiKey, verbose: v });
        success++;
        break;
      } catch (err) {
        if (v) console.log(`[shorten] attempt ${attempt} failed: ${err?.message || String(err)}`);
        if (attempt === maxRetries) break;
        await sleep(1200 * attempt);
      }
    }

    results.push({ original: url, short });

    const delay = Number(delayMinMs) + Math.random() * (Number(delayMaxMs) - Number(delayMinMs));
    if (Number.isFinite(delay) && delay > 0) await sleep(delay);
  }

  return results;
}

module.exports = {
  providers,
  getRandomShortLink,
  bulkShorten,
};


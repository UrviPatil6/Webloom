const { bulkPingBatch } = require("./bulk-ping-indexer");

/**
 * Ping an array of short links (or {short} objects) using the existing bulk pinger.
 *
 * Accepts:
 * - ["https://is.gd/abc", ...]
 * - [{ original: "https://...", short: "https://is.gd/abc" }, ...]
 *
 * @param {Array<string|{short?: string}>} items
 * @param {object} [options] forwarded to bulkPingBatch
 */
async function pingAllShortLinks(items, options = {}) {
  if (!Array.isArray(items)) items = [items];

  const urls = items
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object" && typeof x.short === "string") return x.short;
      return null;
    })
    .map((s) => (s ? String(s).trim() : ""))
    .filter((s) => /^https?:\/\//i.test(s));

  if (!urls.length) return [];

  // For short-link pings, the temp sitemap is usually unnecessary.
  return await bulkPingBatch(urls, { useTempSitemap: false, ...options });
}

module.exports = { pingAllShortLinks };


#!/usr/bin/env node

/**
 * Page Link Indexer CLI v3.1 — 9 Indexing Strategies (2026 + YouTube)
 *
 * Usage:
 *   node src/cli.js <url1> <url2>            Submit to ALL 9 services
 *   node src/cli.js --file urls.txt           Submit from file
 *   node src/cli.js --google <urls>           Google Indexing API only
 *   node src/cli.js --indexnow <urls>         IndexNow only (2 engines)
 *   node src/cli.js --bing <urls>             Bing Webmaster API only
 *   node src/cli.js --youtube <urls>          YouTube URLs → IndexNow + Bing
 *   node src/cli.js --websub                  WebSub/PubSubHubbub publish
 *   node src/cli.js --rss-ping                RSS/XML-RPC ping (5 services)
 *   node src/cli.js --inspect <url>           Check indexing status
 *   node src/cli.js --sitemap-ping            Ping sitemap (Bing)
 *   node src/cli.js --sitemap-resubmit        Force GSC sitemap resubmit
 *   node src/cli.js --stats                   Show statistics
 *   node src/cli.js --key                     Show IndexNow key
 */

require("dotenv").config();
const fs = require("fs");
const PageLinkIndexer = require("./indexer");
const { bulkShorten } = require("./shorteners");

const args = process.argv.slice(2);

// Colors
const c = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", magenta: "\x1b[35m", gray: "\x1b[90m",
};

function banner() {
  console.log(`
${c.cyan}${c.bold}  ⚡ Page Link Indexer${c.reset} ${c.dim}v3.1 — 9 Strategies (2026 + YouTube)${c.reset}
${c.gray}  ─────────────────────────────────────────────${c.reset}
  `);
}

function help() {
  banner();
  console.log(`${c.bold}  Usage:${c.reset}
    node src/cli.js <url1> <url2> ...         Submit to ALL 9 services
    node src/cli.js --file urls.txt           Submit from file

  ${c.bold}Individual Strategies:${c.reset}
    --google <urls>          Google Indexing API
    --indexnow <urls>        IndexNow (2 engines: Bing, Yandex)
    --bing <urls>            Bing Webmaster URL Submit
    --youtube <urls>         YouTube URLs → IndexNow + Bing
    --websub                 WebSub/PubSubHubbub publish
    --rss-ping               RSS/XML-RPC ping (1 service)
    --sitemap-ping           Sitemap ping (Bing)
    --sitemap-resubmit       Force GSC sitemap resubmit

  ${c.bold}Tools:${c.reset}
    --inspect <url>          Check indexing status via Google
    --stats                  Show statistics
    --key                    Show IndexNow key

  ${c.bold}Examples:${c.reset}
    node src/cli.js https://troikatech.ai/blog/new-post
    node src/cli.js --file today-urls.txt
    node src/cli.js --google --bing https://site.com/page1
    node src/cli.js --inspect https://troikatech.ai/about
  `);
}

const indexer = new PageLinkIndexer({
  siteUrl: process.env.SITE_URL,
  sitemapUrl: process.env.SITEMAP_URL,
  googleServiceAccountKeyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  googleServiceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) : null,
  indexNowKey: process.env.INDEXNOW_KEY || undefined,
  bingApiKey: process.env.BING_API_KEY,
  rssFeedUrl: process.env.RSS_FEED_URL,
  websubEnabled: process.env.WEBSUB_ENABLED !== "false",
  googleContentType: process.env.GOOGLE_CONTENT_TYPE || "url_updated",
});

async function main() {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    help();
    process.exit(0);
  }

  banner();

  // Stats
  if (args.includes("--stats")) {
    const stats = indexer.getStats();
    console.log(`  ${c.bold}Today${c.reset}`);
    console.log(`    Submitted: ${c.cyan}${stats.today.submitted}${c.reset}`);
    console.log(`    Success:   ${c.green}${stats.today.success}${c.reset}`);
    console.log(`    Failed:    ${c.red}${stats.today.failed}${c.reset}`);
    console.log(`\n  ${c.bold}All Time${c.reset}`);
    console.log(`    Total:       ${c.cyan}${stats.allTime.totalSubmissions}${c.reset}`);
    console.log(`    Success:     ${c.green}${stats.allTime.success}${c.reset}`);
    console.log(`    Failed:      ${c.red}${stats.allTime.failed}${c.reset}`);
    console.log(`    Unique URLs: ${c.magenta}${stats.allTime.uniqueUrls}${c.reset}`);
    console.log(`    Success Rate:${c.yellow} ${stats.allTime.successRate}%${c.reset}`);
    console.log(`\n  ${c.bold}Service Status${c.reset}`);
    console.log(`    Google:       ${stats.google.configured ? `${c.green}✓${c.reset} ${stats.google.remaining}/${stats.google.dailyLimit} remaining` : `${c.dim}Not configured${c.reset}`}`);
    console.log(`    IndexNow:     ${stats.indexNow.configured ? `${c.green}✓${c.reset} ${stats.indexNow.engines.join(", ")}` : `${c.dim}Not configured${c.reset}`}`);
    console.log(`    Bing WM:      ${stats.bingWebmaster.configured ? `${c.green}✓${c.reset}` : `${c.dim}Not configured${c.reset}`}`);
    console.log(`    Yandex WM:    ${stats.yandexWebmaster.configured ? `${c.green}✓${c.reset}` : `${c.dim}Not configured${c.reset}`}`);
    console.log(`    WebSub:       ${stats.webSub.enabled ? `${c.green}✓${c.reset} ${stats.webSub.hubs} hubs` : `${c.dim}Disabled${c.reset}`}`);
    console.log(`    RSS Ping:     ${c.green}✓${c.reset} ${stats.rssPing.services} services`);
    console.log(`    Sitemap:      ${stats.sitemap.configured ? `${c.green}✓${c.reset}` : `${c.dim}Not configured${c.reset}`}`);
    console.log(`    Recent SM:    ${c.green}✓${c.reset} ${stats.recentSitemap.urlCount} URLs\n`);
    return;
  }

  // IndexNow key
  if (args.includes("--key")) {
    console.log(`  IndexNow Key: ${c.cyan}${indexer.getIndexNowKey()}${c.reset}`);
    console.log(`  Verify at:    ${process.env.SITE_URL || "https://yoursite.com"}/${indexer.getIndexNowKey()}.txt\n`);
    return;
  }

  // Sitemap ping
  if (args.includes("--sitemap-ping")) {
    console.log(`  ${c.dim}Pinging search engines…${c.reset}\n`);
    const results = await indexer.pingSitemap();
    results.forEach((r) => {
      const icon = r.status === "success" ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      console.log(`    ${icon} ${r.engine}: ${r.status}`);
    });
    console.log("");
    return;
  }

  // Sitemap resubmit
  if (args.includes("--sitemap-resubmit")) {
    console.log(`  ${c.dim}Resubmitting sitemap to Google Search Console…${c.reset}\n`);
    const result = await indexer.googleResubmitSitemap();
    if (result.status === "success") {
      console.log(`    ${c.green}✓${c.reset} Sitemap resubmitted → triggers fresh crawl\n`);
    } else {
      console.log(`    ${c.red}✗${c.reset} ${result.error || result.reason}\n`);
    }
    return;
  }

  // WebSub publish
  if (args.includes("--websub")) {
    console.log(`  ${c.dim}Publishing to WebSub hubs…${c.reset}\n`);
    const results = await indexer.publishToWebSub([]);
    results.forEach((r) => {
      const icon = r.status === "success" ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      console.log(`    ${icon} ${r.service}: ${r.status}`);
    });
    console.log("");
    return;
  }

  // RSS ping
  if (args.includes("--rss-ping")) {
    console.log(`  ${c.dim}Pinging RSS services…${c.reset}\n`);
    const results = await indexer.pingRSSServices();
    results.forEach((r) => {
      const icon = r.status === "success" ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
      console.log(`    ${icon} ${r.service}: ${r.status}`);
    });
    console.log("");
    return;
  }

  // Inspect
  if (args.includes("--inspect")) {
    const url = args[args.indexOf("--inspect") + 1];
    if (!url || !url.startsWith("http")) {
      console.log(`  ${c.red}Provide a URL to inspect${c.reset}\n`);
      process.exit(1);
    }
    console.log(`  ${c.dim}Inspecting ${url}…${c.reset}\n`);
    const result = await indexer.inspectUrl(url);
    if (result.error) {
      console.log(`  ${c.red}Error: ${result.error}${c.reset}\n`);
    } else {
      console.log(`    Verdict:     ${result.verdict === "PASS" ? c.green : c.yellow}${result.verdict}${c.reset}`);
      console.log(`    Coverage:    ${result.coverageState}`);
      console.log(`    Indexing:    ${result.indexingState}`);
      console.log(`    Robots.txt:  ${result.robotsTxtState}`);
      console.log(`    Page Fetch:  ${result.pageFetchState}`);
      console.log(`    Last Crawl:  ${result.lastCrawlTime || "N/A"}`);
    }
    console.log("");
    return;
  }

  // Shorten URLs (utility)
  if (args.includes("--shorten")) {
    // Gather URLs (same logic as submit flow)
    let urls = [];
    const fileIdx = args.indexOf("--file");
    if (fileIdx !== -1 && args[fileIdx + 1]) {
      const content = fs.readFileSync(args[fileIdx + 1], "utf8");
      urls = content.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http"));
    } else {
      urls = args.filter((a) => !a.startsWith("--")).filter((a) => a.startsWith("http"));
    }

    if (!urls.length) {
      console.log(`  ${c.red}No valid URLs provided for --shorten.${c.reset}\n`);
      process.exit(1);
    }

    console.log(`  ${c.bold}Shortening ${urls.length} URL(s)…${c.reset}\n`);
    const results = await bulkShorten(urls, {
      delayMinMs: Number(process.env.SHORTEN_DELAY_MIN_MS || 1500),
      delayMaxMs: Number(process.env.SHORTEN_DELAY_MAX_MS || 4500),
      maxRetries: Number(process.env.SHORTEN_MAX_RETRIES || 2),
      timeoutMs: Number(process.env.SHORTEN_TIMEOUT_MS || 15000),
      cuttlyApiKey: process.env.CUTTLY_API_KEY || undefined,
    });

    results.forEach((r) => {
      if (r.short) {
        console.log(`    ${c.green}✓${c.reset} ${r.original} ${c.dim}→${c.reset} ${c.cyan}${r.short}${c.reset}`);
      } else {
        console.log(`    ${c.red}✗${c.reset} ${r.original} ${c.dim}→ failed${c.reset}`);
      }
    });
    console.log("");
    return;
  }

  // Gather URLs
  let urls = [];
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const content = fs.readFileSync(args[fileIdx + 1], "utf8");
    urls = content.split("\n").map((u) => u.trim()).filter((u) => u.startsWith("http"));
  } else {
    urls = args.filter((a) => !a.startsWith("--")).filter((a) => a.startsWith("http"));
  }

  if (!urls.length) {
    console.log(`  ${c.red}No valid URLs provided.${c.reset}\n`);
    process.exit(1);
  }

  console.log(`  ${c.bold}Submitting ${urls.length} URL(s)${c.reset}\n`);
  urls.forEach((u) => console.log(`    ${c.dim}→${c.reset} ${u}`));
  console.log("");

  // Determine which services
  const options = {};
  if (args.includes("--google")) options.services = ["google"];
  else if (args.includes("--indexnow")) options.services = ["indexnow"];
  else if (args.includes("--bing")) options.services = ["bing_webmaster"];
  else if (args.includes("--youtube")) options.services = ["youtube"];
  else if (args.includes("--yandex")) options.services = ["yandex_webmaster"];

  const results = await indexer.submitAll(urls, options);

  // Summary
  const s = results.summary || {};
  console.log(`\n  ${c.bold}Results${c.reset}`);
  console.log(`  ${c.gray}─────────────────────────${c.reset}`);
  console.log(`    Total:    ${c.cyan}${s.total || 0}${c.reset}`);
  console.log(`    Success:  ${c.green}${s.success || 0}${c.reset}`);
  console.log(`    Accepted: ${c.yellow}${s.accepted || 0}${c.reset}`);
  console.log(`    Failed:   ${c.red}${s.failed || 0}${c.reset}`);
  console.log(`    Skipped:  ${c.dim}${s.skipped || 0}${c.reset}`);

  // Show services used
  if (results.services) {
    console.log(`\n  ${c.bold}Services${c.reset}`);
    for (const [name, data] of Object.entries(results.services)) {
      if (data?.skipped) {
        console.log(`    ${c.dim}⏭ ${name}: Skipped (${data.reason})${c.reset}`);
      } else if (data?.error) {
        console.log(`    ${c.red}✗ ${name}: ${data.error}${c.reset}`);
      } else if (Array.isArray(data)) {
        const ok = data.filter((e) => e.status === "success" || e.status === "accepted").length;
        console.log(`    ${c.green}✓${c.reset} ${name}: ${ok}/${data.length} successful`);
      } else {
        console.log(`    ${c.green}✓${c.reset} ${name}: Done`);
      }
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\n  ${c.red}Fatal: ${e.message}${c.reset}\n`);
  process.exit(1);
});

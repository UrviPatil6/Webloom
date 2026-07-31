/**
 * URL Ping Script — TinyURL + Multiple URL Variants
 * Generates short URLs and URL variants, then pings them
 * 
 * Run: node ping-urls-with-variants.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════

const ORIGINAL_URLS = [
  'https://aiagentsforloanbrokers.medium.com/ai-agents-for-loan-brokers-d1319c460547',
  'https://aiagentsforhospitals.medium.com/ai-agents-for-hospitals-3cda458ce95d',
  'https://aiagentsforbanking.medium.com/ai-agents-for-banking-890e178085d5',
  'https://aiagentsforequipment.medium.com/ai-agents-for-equipment-5e6d34dce805',
];

// Ping endpoints (the 4 that work best)
const PING_ENDPOINTS = [
  'https://webmaster.yandex.com/ping?sitemap=',
  'https://webmaster.yandex.ru/ping?sitemap=',
  'https://pingomatic.com/ping/?url=',
  'http://www.pingoat.net/ping.php?url=',
];

const DELAY_MIN_MS = 2000;
const DELAY_MAX_MS = 8000;

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay() {
  return Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS + 1)) + DELAY_MIN_MS;
}

// Generate short URLs using multiple services
async function generateShortUrls(url) {
  const shortUrls = {};

  // 1. TinyURL
  try {
    const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
      timeout: 10000,
    });
    shortUrls.tinyurl = response.data.trim();
    console.log(`    ✓ TinyURL: ${shortUrls.tinyurl}`);
  } catch (err) {
    console.log(`    ✗ TinyURL failed: ${err.message}`);
  }

  await sleep(500);

  // 2. Is.gd
  try {
    const response = await axios.get(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`, {
      timeout: 10000,
    });
    if (response.data.shorturl) {
      shortUrls.isgd = response.data.shorturl;
      console.log(`    ✓ Is.gd: ${shortUrls.isgd}`);
    }
  } catch (err) {
    console.log(`    ✗ Is.gd failed: ${err.message}`);
  }

  await sleep(500);

  // 3. V.gd (alternative to Is.gd)
  try {
    const response = await axios.get(`https://v.gd/?url=${encodeURIComponent(url)}&format=json`, {
      timeout: 10000,
    });
    if (response.data.shorturl) {
      shortUrls.vgd = response.data.shorturl;
      console.log(`    ✓ V.gd: ${shortUrls.vgd}`);
    }
  } catch (err) {
    console.log(`    ✗ V.gd failed: ${err.message}`);
  }

  await sleep(500);

  // 4. Bit.ly (public API - no auth required for basic shortening)
  try {
    const response = await axios.post(`https://api-ssl.bitly.com/v3/shorten`, null, {
      params: {
        access_token: 'generic_access_token',
        longUrl: url,
        format: 'json',
      },
      timeout: 10000,
    });
    if (response.data.data && response.data.data.url) {
      shortUrls.bitly = response.data.data.url;
      console.log(`    ✓ Bit.ly: ${shortUrls.bitly}`);
    }
  } catch (err) {
    console.log(`    ✗ Bit.ly failed: ${err.message}`);
  }

  await sleep(500);

  // 5. Ow.ly (HootSuite's shortener)
  try {
    const response = await axios.get(`https://ow.ly/api/1.1/url/shorten?url=${encodeURIComponent(url)}&apiKey=generic`, {
      timeout: 10000,
    });
    if (response.data.results && response.data.results[url]) {
      shortUrls.owly = response.data.results[url].shortUrl;
      console.log(`    ✓ Ow.ly: ${shortUrls.owly}`);
    }
  } catch (err) {
    console.log(`    ✗ Ow.ly failed: ${err.message}`);
  }

  await sleep(500);

  // 6. Tco.co (Twitter's shortener)
  try {
    const response = await axios.get(`https://tco.co/create?url=${encodeURIComponent(url)}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });
    if (response.data && response.data.url) {
      shortUrls.tco = response.data.url;
      console.log(`    ✓ Tco.co: ${shortUrls.tco}`);
    }
  } catch (err) {
    console.log(`    ✗ Tco.co failed: ${err.message}`);
  }

  await sleep(500);

  // 7. Short.link
  try {
    const response = await axios.get(`https://short.link/api/url/add?url=${encodeURIComponent(url)}&format=json`, {
      timeout: 10000,
    });
    if (response.data.result && response.data.result.short_link) {
      shortUrls.shortlink = response.data.result.short_link;
      console.log(`    ✓ Short.link: ${shortUrls.shortlink}`);
    }
  } catch (err) {
    console.log(`    ✗ Short.link failed: ${err.message}`);
  }

  await sleep(500);

  // 8. Adf.ly (alternative shortener)
  try {
    const response = await axios.get(`https://api.adf.ly/api.php?key=generic&url=${encodeURIComponent(url)}&type=int&domain=adf.ly`, {
      timeout: 10000,
    });
    if (response.data && response.data !== 'error') {
      shortUrls.adfly = response.data;
      console.log(`    ✓ Adf.ly: ${shortUrls.adfly}`);
    }
  } catch (err) {
    console.log(`    ✗ Adf.ly failed: ${err.message}`);
  }

  await sleep(500);

  // 9. Bit.ly v4 (alternative endpoint)
  try {
    const response = await axios.get(`https://bitly.is/p/${Buffer.from(url).toString('base64').substring(0, 6)}`, {
      timeout: 10000,
    });
    if (response.status === 200) {
      shortUrls.bitlyAlt = `https://bitly.is/${Buffer.from(url).toString('base64').substring(0, 6)}`;
      console.log(`    ✓ Bit.ly (alt): ${shortUrls.bitlyAlt}`);
    }
  } catch (err) {
    // Ignore
  }

  await sleep(500);

  // 10. Goo.gl alternative (using Cleanuri)
  try {
    const response = await axios.post(`https://cleanuri.com/api/v1/shorten`, {
      url: url,
    }, {
      timeout: 10000,
    });
    if (response.data && response.data.result_url) {
      shortUrls.cleanuri = response.data.result_url;
      console.log(`    ✓ Clean URI: ${shortUrls.cleanuri}`);
    }
  } catch (err) {
    console.log(`    ✗ Clean URI failed: ${err.message}`);
  }

  return shortUrls;
}

// Generate multiple URL variations (UTM params, tracking codes, etc.)
function generateUrlVariants(baseUrl, shortUrls) {
  const variants = [
    baseUrl, // Original
    ...Object.values(shortUrls).filter(url => url), // All short URLs
  ];

  // UTM tracking variants
  const utmVariations = [
    { source: 'google', medium: 'organic', campaign: 'ai-agents' },
    { source: 'linkedin', medium: 'social', campaign: 'ai-agents' },
    { source: 'twitter', medium: 'social', campaign: 'ai-agents' },
    { source: 'direct', medium: 'referral', campaign: 'ai-agents' },
    { source: 'facebook', medium: 'social', campaign: 'ai-agents' },
    { source: 'reddit', medium: 'social', campaign: 'ai-agents' },
    { source: 'instagram', medium: 'social', campaign: 'ai-agents' },
    { source: 'pinterest', medium: 'social', campaign: 'ai-agents' },
  ];

  utmVariations.forEach(utm => {
    const params = new URLSearchParams({
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
    });
    variants.push(`${baseUrl}?${params.toString()}`);
    
    // Also add UTM params to some short URLs
    Object.values(shortUrls).slice(0, 3).forEach(shortUrl => {
      if (shortUrl) {
        variants.push(`${shortUrl}?utm_source=${utm.source}`);
      }
    });
  });

  // Query parameter variations (bypass cache)
  const timestamps = [
    Date.now(),
    Date.now() - 1000,
    Date.now() - 2000,
    Date.now() - 3000,
  ];

  timestamps.forEach(ts => {
    variants.push(`${baseUrl}?ref=${ts}`);
    Object.values(shortUrls).slice(0, 2).forEach(shortUrl => {
      if (shortUrl) {
        variants.push(`${shortUrl}?v=${ts % 10000}`);
      }
    });
  });

  // Referrer parameter variants
  const referrers = ['google', 'linkedin', 'twitter', 'facebook', 'medium'];
  referrers.forEach(ref => {
    variants.push(`${baseUrl}?referrer=${ref}`);
  });

  return variants;
}

async function pingUrl(url, endpoint) {
  try {
    const pingUrl = `${endpoint}${encodeURIComponent(url)}`;
    const response = await axios.get(pingUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (err) {
    return {
      success: false,
      status: err.response?.status || 'N/A',
      error: err.message,
    };
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('URL Ping Script with Multiple URL Shorteners + Variants');
  console.log('═══════════════════════════════════════════════\n');

  const allUrls = [];
  const results = [];

  // Step 1: Generate Short URLs and variants
  console.log('📋 STEP 1: Generating Short URLs from Multiple Services...\n');

  for (let i = 0; i < ORIGINAL_URLS.length; i++) {
    const originalUrl = ORIGINAL_URLS[i];
    console.log(`\n[${i + 1}/${ORIGINAL_URLS.length}] Processing: ${originalUrl}`);
    console.log('  Generating short URLs from multiple services:');
    
    // Generate short URLs from all services
    const shortUrls = await generateShortUrls(originalUrl);
    
    const successCount = Object.keys(shortUrls).length;
    console.log(`  ✓ Successfully generated ${successCount} short URLs`);
    
    // Generate variants
    const variants = generateUrlVariants(originalUrl, shortUrls);
    console.log(`  ✓ Generated ${variants.length} URL variants (including originals and short URLs)`);
    
    allUrls.push(...variants);
    results.push({
      original: originalUrl,
      shortUrls: shortUrls,
      variants: variants,
      totalVariants: variants.length,
      shortUrlCount: successCount,
    });
    
    await sleep(2000); // Respect API rate limits
  }

  console.log(`\n✓ Total URLs to ping: ${allUrls.length}`);

  // Step 2: Ping all URLs
  console.log('\n═══════════════════════════════════════════════');
  console.log('🔔 STEP 2: Pinging All URLs...\n');

  let totalPings = 0;
  let successPings = 0;
  const pingResults = [];

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    const endpoint = PING_ENDPOINTS[i % PING_ENDPOINTS.length];
    
    console.log(`[${i + 1}/${allUrls.length}] Pinging: ${url.substring(0, 70)}...`);
    console.log(`  → Endpoint: ${endpoint}`);
    
    const result = await pingUrl(url, endpoint);
    totalPings++;
    
    if (result.success) {
      console.log(`  ✓ Success (${result.status} ${result.statusText})`);
      successPings++;
    } else {
      console.log(`  ✗ Failed (${result.status}: ${result.error})`);
    }
    
    pingResults.push({
      url: url,
      endpoint: endpoint,
      result: result,
    });
    
    // Random delay between pings
    if (i < allUrls.length - 1) {
      const delay = randomDelay();
      console.log(`  ⏳ Waiting ${delay}ms before next ping...\n`);
      await sleep(delay);
    }
  }

  // Step 3: Save results
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 STEP 3: Saving Results...\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(__dirname, `ping-results-${timestamp}.json`);

  const summaryData = {
    timestamp: new Date().toISOString(),
    totalOriginalUrls: ORIGINAL_URLS.length,
    totalShortUrlsGenerated: results.reduce((sum, r) => sum + r.shortUrlCount, 0),
    totalUrlVariants: allUrls.length,
    totalPings: totalPings,
    successfulPings: successPings,
    failedPings: totalPings - successPings,
    successRate: ((successPings / totalPings) * 100).toFixed(2) + '%',
    urls: results,
    pingResults: pingResults,
  };

  fs.writeFileSync(resultsFile, JSON.stringify(summaryData, null, 2));
  console.log(`✓ Results saved to: ${resultsFile}`);

  // Step 4: Summary
  console.log('\n═══════════════════════════════════════════════');
  console.log('📈 SUMMARY\n');
  console.log(`Original URLs:              ${ORIGINAL_URLS.length}`);
  console.log(`Short URLs Generated:       ${summaryData.totalShortUrlsGenerated}`);
  console.log(`Total URL Variants:         ${allUrls.length}`);
  console.log(`Total Pings Sent:           ${totalPings}`);
  console.log(`Successful Pings:           ${successPings}`);
  console.log(`Failed Pings:               ${totalPings - successPings}`);
  console.log(`Success Rate:               ${summaryData.successRate}`);
  console.log('\n═══════════════════════════════════════════════');
  console.log('\nURL Shortening Services Used:');
  console.log('  • TinyURL');
  console.log('  • Is.gd');
  console.log('  • V.gd');
  console.log('  • Bit.ly');
  console.log('  • Ow.ly');
  console.log('  • Tco.co (Twitter)');
  console.log('  • Short.link');
  console.log('  • Adf.ly');
  console.log('  • Clean URI');
  console.log('\nPing Endpoints Used:');
  PING_ENDPOINTS.forEach(ep => console.log(`  • ${ep}`));
  console.log('\n═══════════════════════════════════════════════');
}

main().catch(console.error);

const { chromium } = require('playwright-extra');
const StealthPlugin = require('playwright-extra-plugin-stealth');
chromium.use(StealthPlugin());

const urls = [
  'https://medium.com/@username/your-unindexed-post',
  // ...
];

const residentialProxies = [
  'http://user:pass@proxy1:port',
  // add real residential proxies
];

async function fakeGooglebotVisit(url) {
  const proxy = residentialProxies[Math.floor(Math.random() * residentialProxies.length)];

  const browser = await chromium.launch({
    headless: true,
    proxy: { server: proxy }
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    javaScriptEnabled: true,
    bypassCSP: true
  });

  const page = await context.newPage();

  try {
    console.log(`Visiting ${url} as Googlebot via ${proxy}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    // Very important: human-like behavior
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.4));
    await page.mouse.move(Math.random()*1000, Math.random()*600, { steps: 10 });
    await page.waitForTimeout(25000 + Math.random()*45000); // 25–70 seconds

    console.log(`Completed: ${url}`);
  } catch (err) {
    console.error(`Failed: ${url} → ${err.message}`);
  } finally {
    await browser.close();
  }
}

// Run very slowly — max 5–15 per day per URL
async function run() {
  for (const url of urls) {
    for (let i = 0; i < 6; i++) { // example: 6 visits per URL
      await fakeGooglebotVisit(url);
      await new Promise(r => setTimeout(r, 3600000 + Math.random()*7200000)); // 1–3 hours delay
    }
  }
}

run();
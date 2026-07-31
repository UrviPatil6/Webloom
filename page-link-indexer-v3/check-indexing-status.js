/**
 * Quick Checklist: Is Your URL Indexed?
 * 
 * Run: node check-indexing-status.js
 */

const axios = require('axios');
const readline = require('readline');

const URLs = [
  'https://aiagentsforloanbrokers.medium.com/ai-agents-for-loan-brokers-d1319c460547',
  'https://aiagentsforhospitals.medium.com/ai-agents-for-hospitals-3cda458ce95d',
  'https://aiagentsforbanking.medium.com/ai-agents-for-banking-890e178085d5',
  'https://aiagentsforequipment.medium.com/ai-agents-for-equipment-5e6d34dce805',
];

async function checkIndexingStatus(url) {
  console.log(`\n🔍 Checking: ${url}`);
  console.log('─────────────────────────────────────────────\n');

  const checks = [];

  // 1. Check if URL is accessible
  console.log('1️⃣  Checking if URL is accessible...');
  try {
    const response = await axios.head(url, { timeout: 10000, maxRedirects: 5 });
    checks.push({
      name: 'URL Accessible',
      status: '✓',
      details: `Status ${response.status}`,
    });
    console.log(`   ✓ Accessible (${response.status})`);
  } catch (err) {
    checks.push({
      name: 'URL Accessible',
      status: '✗',
      details: err.message,
    });
    console.log(`   ✗ Not accessible: ${err.message}`);
  }

  // 2. Check Google cache
  console.log('\n2️⃣  Checking Google cache...');
  const googleCacheUrl = `https://webcache.googleusercontent.com/cache:${url}`;
  try {
    const response = await axios.head(googleCacheUrl, { timeout: 5000 });
    checks.push({
      name: 'In Google Cache',
      status: '✓',
      details: 'Found in cache',
    });
    console.log(`   ✓ Found in Google cache`);
  } catch (err) {
    checks.push({
      name: 'In Google Cache',
      status: '✗',
      details: 'Not in cache',
    });
    console.log(`   ✗ Not in Google cache yet`);
  }

  // 3. Check metadata
  console.log('\n3️⃣  Checking page metadata...');
  try {
    const response = await axios.get(url, { timeout: 10000 });
    const hasTitle = response.data.includes('<title>');
    const hasMetaDescription = response.data.includes('name="description"');
    const hasOpenGraph = response.data.includes('og:title');

    if (hasTitle && hasMetaDescription && hasOpenGraph) {
      checks.push({
        name: 'SEO Metadata',
        status: '✓',
        details: 'Title, description, OG tags present',
      });
      console.log(`   ✓ Good SEO metadata`);
    } else {
      checks.push({
        name: 'SEO Metadata',
        status: '⚠',
        details: `Missing: ${!hasTitle ? 'title ' : ''}${!hasMetaDescription ? 'description ' : ''}${!hasOpenGraph ? 'OG tags' : ''}`,
      });
      console.log(`   ⚠ Some metadata missing`);
    }
  } catch (err) {
    console.log(`   ✗ Could not fetch page`);
  }

  return checks;
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('📊 URL Indexing Status Checker');
  console.log('═══════════════════════════════════════════════\n');

  const allChecks = [];

  for (const url of URLs) {
    const checks = await checkIndexingStatus(url);
    allChecks.push({ url, checks });
    await new Promise(r => setTimeout(r, 2000)); // Delay between requests
  }

  // Summary
  console.log('\n\n═══════════════════════════════════════════════');
  console.log('📈 SUMMARY\n');

  const indexedCount = allChecks.filter(item => 
    item.checks.some(check => check.name === 'In Google Cache' && check.status === '✓')
  ).length;

  console.log(`URLs Checked: ${URLs.length}`);
  console.log(`In Google Cache: ${indexedCount}`);
  console.log(`Not Yet Indexed: ${URLs.length - indexedCount}\n`);

  if (indexedCount === 0) {
    console.log('⚠️  None of your URLs are indexed yet!\n');
    console.log('Next Steps:');
    console.log('1. Verify your property in Google Search Console');
    console.log('2. Add service account email with Owner access');
    console.log('3. Run: node google-url-inspection-submit.js');
    console.log('4. Check again in 24-48 hours\n');
  } else {
    console.log(`✓ ${indexedCount} URL(s) are already indexed!\n`);
  }

  console.log('═══════════════════════════════════════════════');
  console.log('\nFor manual verification:');
  console.log('1. Google Search Console: https://search.google.com/search-console');
  console.log('2. Check each URL in URL Inspection tool');
  console.log('3. Coverage tab shows indexed status\n');
}

main().catch(console.error);

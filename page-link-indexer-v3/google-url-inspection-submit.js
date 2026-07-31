/**
 * Google Search Console URL Inspection API
 * Directly submit URLs to Google for indexing
 * 
 * Requirements:
 * 1. Google Cloud project with Web Search Indexing API enabled
 * 2. Service account JSON key file
 * 3. Property verified in Google Search Console
 * 
 * Run: node google-url-inspection-submit.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ═══════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════

const URLs_TO_SUBMIT = [
  'https://aiagentsforloanbrokers.medium.com/ai-agents-for-loan-brokers-d1319c460547',
  'https://aiagentsforhospitals.medium.com/ai-agents-for-hospitals-3cda458ce95d',
  'https://aiagentsforbanking.medium.com/ai-agents-for-banking-890e178085d5',
  'https://aiagentsforequipment.medium.com/ai-agents-for-equipment-5e6d34dce805',
];

// Your Google Search Console property URL
// Examples:
//   - https://medium.com/ (URL property)
//   - sc-domain:medium.com (Domain property - preferred)
const GSC_PROPERTY = process.env.GSC_SITE_URL || 'sc-domain:medium.com';

// Path to your Google Cloud service account JSON key
const SERVICE_ACCOUNT_KEY_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || './key-range-indexer.json';

// ═══════════════════════════════════════
// UTILS
// ═══════════════════════════════════════

async function getAccessToken(serviceAccountKey) {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const payload = {
    iss: serviceAccountKey.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
  };

  const token = jwt.sign(payload, serviceAccountKey.private_key, {
    algorithm: 'RS256',
    header: { typ: 'JWT' },
  });

  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
    });

    return response.data.access_token;
  } catch (err) {
    throw new Error(`Failed to get access token: ${err.message}`);
  }
}

async function inspectUrl(accessToken, property, url) {
  const apiUrl = `https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`;

  try {
    const response = await axios.post(
      apiUrl,
      {
        inspectionUrl: url,
        languageCode: 'en',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.response?.data?.error?.message || err.message,
      status: err.response?.status,
    };
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

async function submitUrls() {
  console.log('═══════════════════════════════════════════════');
  console.log('Google Search Console URL Inspection Submission');
  console.log('═══════════════════════════════════════════════\n');

  // Step 1: Load service account credentials
  console.log('📋 STEP 1: Loading Google Cloud Credentials...\n');

  let serviceAccountKey;
  let accessToken;

  try {
    if (!fs.existsSync(SERVICE_ACCOUNT_KEY_FILE)) {
      console.error(`❌ ERROR: Service account key file not found: ${SERVICE_ACCOUNT_KEY_FILE}`);
      console.error('\nTo fix this:');
      console.error('1. Go to Google Cloud Console: https://console.cloud.google.com');
      console.error('2. Create a service account with "Owner" role');
      console.error('3. Download the JSON key file');
      console.error('4. Place it at: ' + path.resolve(SERVICE_ACCOUNT_KEY_FILE));
      console.error('5. Update .env: GOOGLE_SERVICE_ACCOUNT_KEY_FILE=/path/to/key.json\n');
      process.exit(1);
    }

    serviceAccountKey = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_KEY_FILE, 'utf8'));
    console.log('✓ Loaded service account: ' + serviceAccountKey.client_email);
    console.log('✓ Project ID: ' + serviceAccountKey.project_id);
  } catch (err) {
    console.error('❌ Failed to load credentials:', err.message);
    process.exit(1);
  }

  // Step 2: Get access token
  console.log('\n📋 STEP 2: Getting Google OAuth Access Token...\n');

  try {
    accessToken = await getAccessToken(serviceAccountKey);
    console.log('✓ Successfully authenticated with Google API');
  } catch (err) {
    console.error('❌ Failed to get access token:', err.message);
    process.exit(1);
  }

  // Step 3: Submit URLs for inspection/indexing
  console.log('\n📋 STEP 3: Submitting URLs for Google Indexing...\n');
  console.log(`Property: ${GSC_PROPERTY}\n`);

  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (let i = 0; i < URLs_TO_SUBMIT.length; i++) {
    const url = URLs_TO_SUBMIT[i];
    console.log(`[${i + 1}/${URLs_TO_SUBMIT.length}] ${url}`);

    const result = await inspectUrl(accessToken, GSC_PROPERTY, url);

    if (result.success) {
      console.log(`  ✓ Submitted for indexing`);
      const verdict = result.data?.inspectionResult?.indexStatusResult?.verdict;
      if (verdict) {
        console.log(`  Status: ${verdict}`);
      }
      successCount++;
      results.push({
        url: url,
        status: 'success',
        response: result.data,
      });
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
      failCount++;
      results.push({
        url: url,
        status: 'failed',
        error: result.error,
        httpStatus: result.status,
      });
    }

    // Respectful delay between requests
    if (i < URLs_TO_SUBMIT.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }


  // Step 4: Summary
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 SUMMARY\n');
  console.log(`Total URLs Submitted: ${URLs_TO_SUBMIT.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Success Rate: ${((successCount / URLs_TO_SUBMIT.length) * 100).toFixed(0)}%`);
  console.log('\n═══════════════════════════════════════════════');

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(__dirname, `gsc-submission-results-${timestamp}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n✓ Results saved to: ${resultsFile}\n`);

  if (successCount > 0) {
    console.log('✓ URLs submitted successfully!\n');
    console.log('Next Steps:');
    console.log('1. Check Google Search Console: https://search.google.com/search-console');
    console.log('2. Go to Coverage → Indexed to see your URLs');
    console.log('3. Go to URL Inspection to check individual URL status');
    console.log('4. It may take 24-48 hours for URLs to be fully indexed\n');
  } else {
    console.log('⚠️  All submissions failed. Troubleshooting:\n');
    console.log('1. Verify service account has "Editor" or "Owner" role in Google Cloud');
    console.log('2. Add service account email to Google Search Console with "Owner" access');
    console.log('3. Verify property is added correctly (sc-domain:medium.com or https://medium.com/)');
    console.log('4. Check that Web Search Indexing API is enabled in Google Cloud\n');
  }

  console.log('═══════════════════════════════════════════════\n');
}

submitUrls().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

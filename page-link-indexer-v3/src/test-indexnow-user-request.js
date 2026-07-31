const axios = require('axios');

// Parameters provided by user
const HOST = 'aiwebdesign.co.in'; 
const KEY = '93328baa98da49ceb5141873efaffbe8';
// Note: This is a cPanel internal URL, likely inaccessible to the public/IndexNow bots
const KEY_LOCATION = 'https://aiwebdesign.co.in:2083/cpsess5166989448/frontend/jupiter/filemanager/showfile.html?file=93328baa98da49ceb5141873efaffbe8.txt';
const URL_LIST = [
  'https://bestaiagentsin2026.medium.com/best-ai-agents-in-2026-top-ai-tools-transforming-business-a8b314d73644'
];

async function testIndexNow() {
  const endpoint = 'https://api.indexnow.org/indexnow';
  
  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: URL_LIST
  };

  console.log('🚀 Submitting to IndexNow...');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      validateStatus: () => true // Resolve promise for all status codes
    });

    console.log('\n--- API Response ---');
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log('Data:', response.data);

    if (response.status === 202) {
        console.log('\n⚠️  WARNING: Received 202 Accepted, but verification will likely fail asynchronously because:');
        console.log('1. The URL belongs to "medium.com", but your Host is "aiwebdesign.co.in".');
        console.log('2. The keyLocation is a private cPanel URL, not a public file.');
    }

  } catch (error) {
    console.error('\n❌ Request Error:', error.message);
  }
}

testIndexNow();

const axios = require('axios');

// Configuration from your request
const TARGET_HOST = 'aiwebdesign.co.in'; // Hostname only
const KEY = '93328baa98da49ceb5141873efaffbe8';
const KEY_LOCATION = `https://${TARGET_HOST}/${KEY}.txt`; // Must be a public URL, not C:\...
const URL_LIST = [
  'https://aiwebdesign.co.in/top-web-designing-company-in-mumbai/'
];

async function runIndexNow() {
  const endpoint = 'https://api.indexnow.org/indexnow';
  
  const payload = {
    host: TARGET_HOST,
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
      }
    });

    console.log('\n✅ Success!');
    console.log('Status:', response.status, response.statusText);
    console.log('Data:', response.data);

  } catch (error) {
    console.error('\n❌ Failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

runIndexNow();

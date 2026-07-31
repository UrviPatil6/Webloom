const axios = require('axios');

// Key must be 8-128 chars. "abc123" is too short.
const INDEXNOW_KEY = 'abc123abc123'; 
const DUMMY_DOMAIN = 'dummy-domain.com'; 
const TARGET_URL = 'https://medium.com/@urviwrites/some-post';

async function submitIndexNow() {
  const url = `https://api.indexnow.org/IndexNow?url=${encodeURIComponent(TARGET_URL)}&key=${INDEXNOW_KEY}&keyLocation=https://${DUMMY_DOMAIN}/${INDEXNOW_KEY}.txt`;

  console.log(`Submitting to: ${url}`);

  try {
    const res = await axios.get(url);
    console.log('IndexNow success:', res.status);
    console.log('Response:', res.data);
  } catch (err) {
    console.error('IndexNow failed:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

submitIndexNow();

const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('http://localhost:5001/api/socials', {
      urls: ['https://example.com/test-article'],
      titlePrefix: 'Test Article'
    });
    console.log('Success:', JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

test();
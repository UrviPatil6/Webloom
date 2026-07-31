const axios = require('axios');

const INDEXNOW_KEY = '93328baa98da49ceb5141873efaffbe8';
const DUMMY_DOMAIN = 'aiwebdesign.co.in';
const TARGET_URL = 'https://bestaiagentsin2026.medium.com/best-ai-agents-in-2026-top-ai-tools-transforming-business-a8b314d73644';

async function spoofIndexNow() {
  const url = `https://api.indexnow.org/IndexNow?url=${encodeURIComponent(TARGET_URL)}&key=${INDEXNOW_KEY}&keyLocation=https://${DUMMY_DOMAIN}/${INDEXNOW_KEY}.txt`;

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
        'Referer': 'https://www.bing.com/webmasters/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site'
      },
      timeout: 15000
    });
    console.log('Success:', res.status, res.data);
  } catch (err) {
    console.error('Failed:', err.response?.status, err.response?.data || err.message);
  }
}

spoofIndexNow();
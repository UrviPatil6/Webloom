const axios = require('axios');

const key = 'ab72180bd82740ab9fa6b34afd05109a'; 
const medium = 'https://bestaiagentsin2026.medium.com/best-ai-agents-in-2026-top-ai-tools-transforming-business-a8b314d73644'; 
const yourSite = 'https://aiwebdesign.co.in'; 

console.log('🚀 Submitting URL to Bing Webmaster API...');
console.log(`Site: ${yourSite}`);
console.log(`URL: ${medium}`);

axios.post(
  `https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?apikey=${key}`,
  { siteUrl: yourSite, url: medium },
  { headers: { 'Content-Type': 'application/json' } }
)
.then(res => {
  console.log('\n✅ Success!');
  console.log('Status:', res.status);
  console.log('Data:', res.data);
})
.catch(err => {
  console.error('\n❌ Error!');
  if (err.response) {
    console.error('Status:', err.response.status);
    console.error('Data:', JSON.stringify(err.response.data, null, 2));
  } else {
    console.error('Message:', err.message);
  }
});

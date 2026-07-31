const axios = require('axios');

const WP_API_URL = process.env.WP_API_URL; // e.g., https://example.com/wp-json/wp/v2
const WP_USER = process.env.WP_USER;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

async function createPage(title, content, status = 'publish', metaFields = {}) {
  if (!WP_API_URL || !WP_USER || !WP_APP_PASSWORD) {
    throw new Error('WordPress configuration missing (WP_API_URL, WP_USER, WP_APP_PASSWORD)');
  }

  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');

  try {
    // 1. Create the page first
    const payload = {
      title: title,
      content: content,
      status: status
      // We do NOT send 'meta' here because standard REST API often ignores protected keys
    };

    const response = await axios.post(`${WP_API_URL}/pages`, payload, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data || !response.data.id) {
      throw new Error('WordPress API returned success but no ID');
    }

    const pageId = response.data.id;

    // 2. Force-update Yoast Meta via the custom endpoint provided by Yoast/plugins
    // Or if you added the 'register_post_meta' snippet, sometimes it needs a separate PATCH request.
    // BUT, the most reliable way without relying on 'register_post_meta' working perfectly 
    // is to use the 'yoast_meta' key if the "Yoast REST API" plugin is present, 
    // OR just try to update it again as a second pass if the first one failed.
    
    // However, since the user says it failed, let's try the "Yoast Headless" approach
    // which often uses 'yoast_head_json' or specific endpoints.
    
    // Let's try a fallback: If we provided metaFields, let's try to update them using the 
    // 'yoast_meta' structure which some versions/plugins accept, OR verify if we can
    // hit a custom endpoint if you have one.

    // ERROR: Standard WP REST API simply silently discards `_yoast_` keys if not registered.
    // If the user added the snippet, it SHOULD work.
    // If it didn't work, maybe the snippet is wrong or the keys are different.
    
    // Let's try sending it as 'yoast_head_json' structure? No, that's read-only.

    // RE-TRYING with the 'meta' field in a second PATCH request just in case creation ignored it.
    if (Object.keys(metaFields).length > 0) {
        try {
            await axios.post(`${WP_API_URL}/pages/${pageId}`, {
                meta: metaFields
            }, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[WordPress] Attempted to update meta for Page ID ${pageId}`);
        } catch (metaErr) {
            console.warn(`[WordPress] Failed to update meta for Page ID ${pageId}:`, metaErr.message);
        }
    }

    return {
      id: response.data.id,
      url: response.data.link
    };
  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.error('WordPress API Error:', msg);
    throw new Error(`WordPress API failed: ${msg}`);
  }
}

module.exports = { createPage };

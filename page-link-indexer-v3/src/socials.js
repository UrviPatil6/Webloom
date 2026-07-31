const wp = require('./wordpress');
const { generateSocialContent } = require('./social_generator');

async function processSocialUrls(inputs, titlePrefix = 'Article') {
  console.log('--- Processing Social URLs ---');
  console.log('Target WP API:', process.env.WP_API_URL);
  
  const results = {
    success: [],
    failed: []
  };

  // Normalize inputs to array of objects { url, title }
  const items = inputs.map(i => {
    if (typeof i === 'string') return { url: i, title: null };
    return i;
  });

  for (const item of items) {
    const { url, title: explicitTitle } = item;

    try {
      console.log(`[Socials] Processing URL: ${url}`);

      let title = explicitTitle;

      if (!title) {
         // Generate Title from slug if no explicit title provided
         let slug = url.split('/').filter(Boolean).pop() || 'social-link';
         slug = slug.replace(/[-_]/g, ' ');
         slug = slug.charAt(0).toUpperCase() + slug.slice(1);
         title = `${titlePrefix}: ${slug}`;
       }
 
       console.log(`[Socials] Using Title: "${title}"`);

       // Generate Content using OpenAI
      const { html, metaFields } = await generateSocialContent(title, url);

      console.log('[Socials] SEO Data:', metaFields);

      // Wrap in Custom HTML block for Gutenberg to ensure it uses an HTML Editor block
      // instead of converting to standard paragraph blocks.
      const gutenbergContent = `<!-- wp:html -->
${html}
<!-- /wp:html -->`;

      // Publish to WordPress
      const wpResult = await wp.createPage(title, gutenbergContent, 'publish', metaFields);
      console.log(`[Socials] Published to WP. ID: ${wpResult.id}, URL: ${wpResult.url}`);

      results.success.push({
        url,
        wpUrl: wpResult.url,
        wpId: wpResult.id
      });

      // Rate limit delay (random 1-3s) to avoid hitting OpenAI/WP limits too hard
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));

    } catch (error) {
      console.error(`[Socials] Failed to process ${url}:`, error.message);
      results.failed.push({
        url,
        error: error.message
      });
    }
  }

  return results;
}

module.exports = { processSocialUrls };

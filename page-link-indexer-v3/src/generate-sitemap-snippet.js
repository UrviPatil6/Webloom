const fs = require('fs');

// === CONFIG ===
const outputFile = 'sitemap.xml';

// List all your target URLs here (Medium, X, LinkedIn, etc.)
const urls = [
  'https://bestaiagentsin2026.medium.com/best-ai-agents-in-2026-top-ai-tools-transforming-business-a8b314d73644',
  'https://aiagentsforequipment.medium.com/ai-agents-for-equipment-5e6d34dce805',
  'https://aiagentsforexecutiveoffices.medium.com/ai-agents-for-executive-offices-0c3e5e3625b9'
];

// === LOGIC ===
if (urls.length === 0) {
  console.log('No URLs provided.');
  process.exit(1);
}

// Generate today's date in ISO format for lastmod
const today = new Date().toISOString().split('T')[0];

// Build sitemap content
let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

urls.forEach(url => {
  xml += `  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
`;
});

xml += `</urlset>`;

// Write to file
try {
  fs.writeFileSync(outputFile, xml, 'utf8');
  console.log(`✅ Successfully generated ${outputFile} with ${urls.length} URLs.`);
} catch (err) {
  console.error('❌ Error writing file:', err.message);
}

// Helper to escape XML special chars
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
    }
  });
}

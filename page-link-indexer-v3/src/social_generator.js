const axios = require('axios');

// ────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────

const MODEL = 'gpt-4o-mini'; // cheapest good model

const SEO_INSTRUCTION = `
At the very end of your response, strictly output the SEO data in this format:
---SEO---
Title: [50-60 chars SEO title, include keywords]
Desc: [140-160 chars meta description, compelling + CTA]
Kw: [Focus keyword (same as title main term)]
`;

// 6 prompt variations (structural diversity)
const promptVariations = [
  // 1. Classic Summary + Bulleted Insights
  `Write a 200–300 word unique summary for article "[Title]". Include 4–5 fresh bullet points on key insights. Use fresh language, vary vocabulary, add 1–2 new ideas. Engaging and informative tone. Output format exactly:
P1
[100–150 words paragraph]
P2
[100–150 words paragraph]
B1
[bullet]
B2
[bullet]
B3
[bullet]
B4
[bullet]
B5
[bullet]`,

  // 2. Pros/Cons + Short Conclusion
  `Write a 200–300 word unique summary for article "[Title]". Structure as: 1 intro paragraph, Pros list (4–5 bullets), Cons list (3–4 bullets), short conclusion paragraph. Add 1–2 original ideas. Fresh language, balanced tone. Output format exactly:
INTRO
[80–120 words intro]
PROS
[bullet 1]
[bullet 2]
[bullet 3]
[bullet 4]
[bullet 5]
CONS
[bullet 1]
[bullet 2]
[bullet 3]
[bullet 4]
CONCLUSION
[50–100 words conclusion]`,

  // 3. Timeline + Future Outlook
  `Write a 200–300 word unique summary for article "[Title]". Structure as: 1 current-state paragraph, timeline of developments (4–5 bullets with year/event), future outlook paragraph. Add 1–2 original predictions. Fresh language, forward-thinking tone. Output format exactly:
CURRENT
[100 words current state]
TIMELINE
[bullet 1 – year/event]
[bullet 2]
[bullet 3]
[bullet 4]
[bullet 5]
FUTURE
[100 words outlook]`,

  // 4. Problem-Solution-Results
  `Write a 200–300 word unique summary for article "[Title]". Structure as: Problem paragraph, Solution paragraph, Results & insights (4–5 bullets). Add 1 original result metric or implication. Fresh language, business-focused tone. Output format exactly:
PROBLEM
[80–120 words problem]
SOLUTION
[80–120 words solution]
RESULTS
[bullet 1]
[bullet 2]
[bullet 3]
[bullet 4]
[bullet 5]`,

  // 5. REMOVED Q&A Style due to formatting issues
  // 6. Myth-Busting + Key Takeaways
  `Write a 200–300 word unique summary for article "[Title]". Structure as: 1 intro paragraph debunking 1–2 common myths, then 5 key takeaways as bullets. Add 1 original myth or insight. Fresh, bold tone. Output format exactly:
INTRO
[100 words – myth busting]
TAKEAWAYS
[bullet 1]
[bullet 2]
[bullet 3]
[bullet 4]
[bullet 5]`
];

// Layouts with weights
const layouts = [
  {
    weight: 0.4,
    name: "Classic Card",
    html: `<div style="max-width: 800px; margin: 40px auto; padding: 40px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; background: #fff; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-radius: 12px;">
  <h1 style="font-size: 32px; margin-bottom: 24px; color: #111; text-align: center; font-weight: 700; letter-spacing: -0.5px;">
    [Title]
  </h1>

  <div style="font-size: 17px; margin-bottom: 24px; color: #444;">
    [Paragraph 1]
  </div>

  <div style="font-size: 17px; margin-bottom: 32px; color: #444;">
    [Paragraph 2]
  </div>

  <div style="background: #f9fafb; padding: 24px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 32px;">
    <h3 style="margin-top: 0; margin-bottom: 16px; font-size: 20px; color: #1e293b;">Key Takeaways</h3>
    <ul style="margin: 0; padding-left: 20px; font-size: 16px; color: #334155;">
      <li style="margin-bottom: 10px;">[Bullet 1]</li>
      <li style="margin-bottom: 10px;">[Bullet 2]</li>
      <li style="margin-bottom: 10px;">[Bullet 3]</li>
      <li style="margin-bottom: 10px;">[Bullet 4]</li>
      <li>[Bullet 5]</li>
    </ul>
  </div>

  <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
    <a href="[Medium URL]" target="_blank" rel="noopener noreferrer"
       style="display: inline-block; padding: 14px 32px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 50px; font-weight: 600; font-size: 16px; transition: background-color 0.2s;">
      Read Full Article on Medium
    </a>
    <p style="font-size: 13px; color: #94a3b8; margin-top: 16px;">
      Published on [Date] | AI-Curated Summary
    </p>
  </div>
</div>`
  },
  {
    weight: 0.3,
    name: "Modern Gradient",
    html: `<div style="max-width: 800px; margin: 0 auto; padding: 40px 20px; font-family: system-ui, -apple-system, sans-serif; line-height: 1.7; color: #1f2937;">
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="font-size: 36px; margin-bottom: 16px; background: linear-gradient(135deg, #2563eb, #9333ea); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800;">
      [Title]
    </h1>
    <div style="height: 4px; width: 60px; background: linear-gradient(90deg, #2563eb, #9333ea); margin: 0 auto; border-radius: 2px;"></div>
  </div>

  <p style="font-size: 18px; margin-bottom: 24px; color: #374151;">
    [Paragraph 1]
  </p>

  <p style="font-size: 18px; margin-bottom: 32px; color: #374151;">
    [Paragraph 2]
  </p>

  <div style="margin-bottom: 40px;">
    <h3 style="font-size: 22px; font-weight: 700; margin-bottom: 20px; color: #111;">Highlights</h3>
    <div style="display: grid; gap: 16px;">
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 3px solid #2563eb;">
        [Bullet 1]
      </div>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 3px solid #7c3aed;">
        [Bullet 2]
      </div>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 3px solid #db2777;">
        [Bullet 3]
      </div>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 3px solid #2563eb;">
        [Bullet 4]
      </div>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 3px solid #7c3aed;">
        [Bullet 5]
      </div>
    </div>
  </div>

  <div style="text-align: center;">
    <a href="[Medium URL]" style="font-weight: 700; color: #2563eb; text-decoration: none; border-bottom: 2px solid #2563eb; padding-bottom: 2px; font-size: 18px;">
      Read the original article &rarr;
    </a>
    <p style="margin-top: 20px; font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px;">
      [Date]
    </p>
  </div>
</div>`
  },
  {
    weight: 0.3,
    name: "Minimalist Mono",
    html: `<div style="max-width: 720px; margin: 40px auto; padding: 30px; font-family: 'Courier New', Courier, monospace; line-height: 1.6; color: #222; border: 1px solid #ddd; background: #fafafa;">
  <h1 style="font-size: 24px; margin-bottom: 30px; font-weight: bold; border-bottom: 2px solid #222; padding-bottom: 10px;">
    # [Title]
  </h1>

  <p style="margin-bottom: 20px; font-size: 15px;">
    [Paragraph 1]
  </p>

  <p style="margin-bottom: 30px; font-size: 15px;">
    [Paragraph 2]
  </p>

  <div style="margin-bottom: 30px;">
    <h3 style="font-size: 18px; margin-bottom: 15px; font-weight: bold;">>> INSIGHTS</h3>
    <ul style="list-style-type: square; padding-left: 20px;">
      <li style="margin-bottom: 8px;">[Bullet 1]</li>
      <li style="margin-bottom: 8px;">[Bullet 2]</li>
      <li style="margin-bottom: 8px;">[Bullet 3]</li>
      <li style="margin-bottom: 8px;">[Bullet 4]</li>
      <li style="margin-bottom: 8px;">[Bullet 5]</li>
    </ul>
  </div>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #bbb;">
    <p style="margin-bottom: 10px;">
      <strong>Source:</strong> <a href="[Medium URL]" style="color: #000; text-decoration: underline;">[Medium URL]</a>
    </p>
    <p style="font-size: 12px; color: #666;">
      Generated: [Date]
    </p>
  </div>
</div>`
  }
];

// ────────────────────────────────────────────────
// UTILS
// ────────────────────────────────────────────────

function pickLayout() {
  const totalWeight = layouts.reduce((sum, l) => sum + l.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const l of layouts) {
    rand -= l.weight;
    if (rand <= 0) return l.html;
  }
  return layouts[0].html;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function generateContent(title, prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ OPENAI_API_KEY not set. Using placeholder content.");
    return "This is a placeholder content because OpenAI API key is missing.\n\n---SEO---\nTitle: Placeholder Title\nDesc: Placeholder description.\nKw: Placeholder";
  }

  // Append SEO instructions to the prompt
  const fullPrompt = prompt.replace('[Title]', title) + SEO_INSTRUCTION;

  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: MODEL,
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: 0.8,
      max_tokens: 800, // Increased to accommodate SEO fields
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    return res.data.choices[0].message.content;
  } catch (err) {
    console.error(`OpenAI error for ${title}: ${err.message}`);
    // Return fallback content on error
    return `Could not generate content for ${title}.\n\n---SEO---\nTitle: ${title}\nDesc: Error generating content.\nKw: Error`;
  }
}

// State for round-robin rotation
let lastPromptIndex = -1;
let lastLayoutIndex = -1;

/**
 * Generates a full HTML page for a given title and URL using OpenAI.
 * Returns both HTML and SEO metadata.
 * @param {string} title 
 * @param {string} url 
 * @returns {Promise<{html: string, seo: object}>} 
 */
async function generateSocialContent(title, url) {
  // Rotate Prompts (Round-Robin)
  lastPromptIndex = (lastPromptIndex + 1) % promptVariations.length;
  const prompt = promptVariations[lastPromptIndex];
  console.log(`[SocialGenerator] Using Prompt Index: ${lastPromptIndex}`);

  // Generate raw content (string)
  const rawContent = await generateContent(title, prompt);

  // Split into Body and SEO parts
  const parts = rawContent.split('---SEO---');
  const bodyText = parts[0] || '';
  const seoText = parts[1] || '';

  // Process Body lines
  const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l);

  // Detect format & extract parts (flexible parsing)
  let p1 = lines.find(l => l.length > 50 && !l.match(/^(B\d|PROS|CONS|TAKEAWAYS|Q\d|P\d|INTRO|CURRENT|PROBLEM)/)) || 'Summary paragraph 1...';
  let p2 = lines.find(l => l.length > 50 && l !== p1 && !l.match(/^(B\d|PROS|CONS|TAKEAWAYS|Q\d|P\d|INTRO|CURRENT|PROBLEM)/)) || 'Summary paragraph 2...';
  
  // Extract bullets/list items
  let bullets = [];
  
  // Strategy 1: Look for explicit markers (B1, PROS, etc.)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Case A: Marker is on the same line (e.g., "B1: The content")
    const inlineMatch = line.match(/^(B\d+|PROS|CONS|TAKEAWAYS|Q\d+:|•|-|\d+\.)\s*[:\.]?\s*(.+)/);
    if (inlineMatch && inlineMatch[2].length > 10) {
      bullets.push(inlineMatch[2].trim());
      continue;
    }

    // Case B: Marker is on its own line (e.g., "B1"), content is next line
    const markerMatch = line.match(/^(B\d+|PROS|CONS|TAKEAWAYS|Q\d+:|•|-|\d+\.)\s*$/);
    if (markerMatch && i + 1 < lines.length) {
      const nextLine = lines[i+1];
      if (nextLine.length > 10 && !nextLine.match(/^(B\d+|PROS|CONS|TAKEAWAYS|Q\d+:|•|-|\d+\.)/)) {
         bullets.push(nextLine.trim());
         i++; // Skip next line since we used it
      }
    }
  }

  // Strategy 2: Fallback to just grabbing lines that look like bullet points if Strategy 1 failed
  if (bullets.length < 3) {
    bullets = lines.filter(l => l.length > 20 && l !== p1 && l !== p2 && !l.match(/^(INTRO|CONCLUSION|PROBLEM|SOLUTION|CURRENT|FUTURE)/)).slice(0, 5);
  }

  bullets = shuffleArray(bullets);

  // Rotate Layouts (Round-Robin)
  lastLayoutIndex = (lastLayoutIndex + 1) % layouts.length;
  const layoutHtml = layouts[lastLayoutIndex].html;
  console.log(`[SocialGenerator] Using Layout Index: ${lastLayoutIndex} (${layouts[lastLayoutIndex].name})`);

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  let html = layoutHtml
    .replace(/\[Title\]/g, title)
    .replace(/\[Paragraph 1\]/g, p1)
    .replace(/\[Paragraph 2\]/g, p2)
    .replace(/\[Date\]/g, dateStr)
    .replace(/\[Medium URL\]/g, url);

  for (let i = 0; i < 5; i++) {
    html = html.replace(`[Bullet ${i + 1}]`, bullets[i] || `Insight ${i + 1}`);
  }
  html = html.replace(/\[Bullet \d\]/g, '');

  // Parse SEO Data
  const seo = {
    title: title, // default
    desc: '',
    kw: ''
  };

  if (seoText) {
    const titleMatch = seoText.match(/Title:\s*(.+)/);
    const descMatch = seoText.match(/Desc:\s*(.+)/);
    const kwMatch = seoText.match(/Kw:\s*(.+)/);

    if (titleMatch) seo.title = titleMatch[1].trim();
    if (descMatch) seo.desc = descMatch[1].trim();
    if (kwMatch) seo.kw = kwMatch[1].trim();
  }

  // Map to Yoast keys
  const metaFields = {
    '_yoast_wpseo_title': seo.title,
    '_yoast_wpseo_metadesc': seo.desc,
    '_yoast_wpseo_focuskw': seo.kw
  };

  return { html, metaFields };
}

module.exports = { generateSocialContent };

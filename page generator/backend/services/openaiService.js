const OpenAI = require('openai');
const Settings = require('../models/Settings');

let openaiClient = null;

const initializeOpenAI = async () => {
  const settings = await Settings.findOne();
  if (settings && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
};

initializeOpenAI();

const generateContent = async (mainKeyword, focusKeyword, templateStructure, pageTitle) => {
  if (!openaiClient) {
    await initializeOpenAI();
  }

  if (!openaiClient) {
    throw new Error('OpenAI API key not configured');
  }

  const settings = await Settings.findOne();
  const model = settings?.openai?.model || 'gpt-4o-mini';
  const maxTokens = settings?.openai?.maxTokens || 2000;
  const temperature = settings?.openai?.temperature || 0.7;

  // Check if model supports JSON mode
  // Models that support JSON mode:
  // - gpt-4o, gpt-4o-mini (all variants)
  // - gpt-4-turbo, gpt-4-turbo-preview
  // - gpt-4-0125-preview, gpt-4-1106-preview
  // - gpt-3.5-turbo-1106
  // Note: Base gpt-4 and gpt-3.5-turbo (without version) do NOT support JSON mode
  const modelLower = (model || '').toLowerCase().trim();
  const supportsJsonMode = modelLower.includes('gpt-4o') ||  // Includes gpt-4o-mini
                           modelLower.includes('gpt-4-turbo') ||
                           modelLower.includes('gpt-4-0125') ||
                           modelLower.includes('gpt-4-1106') ||
                           modelLower === 'gpt-3.5-turbo-1106';
  // Explicitly exclude base gpt-4 and gpt-3.5-turbo

  console.log(`[OpenAI] Using model: ${model}, supportsJsonMode: ${supportsJsonMode}`);

  const h1Title = pageTitle || `Best AI Agents for ${mainKeyword} - ${focusKeyword}`;

  const prompt = `You are filling a website template for a B2B industry page.

Template Structure:
1. Intro Section:
   - H1 Title: "${h1Title}"
   - Paragraph 1: ${templateStructure.intro || 150} words introducing the industry
   - Paragraph 2: ${templateStructure.intro || 150} words about challenges and solutions

2. Value Proposition:
   - Main paragraph: ${templateStructure.value || 100} words about AI agents' capabilities
   - 5 feature points (short, one line each)

3. Why Section:
   - Heading: "How AI Agents Transform ${focusKeyword} Sales"
   - 6 feature cards (title + one-line description each)
   - Closing paragraph: 50 words

4. Features Section:
   - Heading: "Industries Powered by Troika Tech AI Agents"
   - Feature Box 1: Title, intro (80 words), bullet list (4 items), result (30 words)
   - Feature Box 2: Title, intro (80 words), bullet list (3 items), result (30 words)
   - Feature Box 3: Title, intro (80 words), bullet list (5 items), result (30 words)
   - Feature Box 4: Title, intro (80 words), bullet list (4 items), result (30 words)
   - Feature Box 5: Title, intro (80 words), bullet list (4 items), result (30 words)

5. Industries Section:
   - Heading: "Product Categories We Serve"
   - Intro paragraph: 50 words
   - 8 category names (short, 2-3 words each)

6. Benefits Section:
   - Heading: "Complete AI-Powered Sales Automation"
   - 6 benefit cards (title + one-line description each)
   - Closing paragraph: 50 words

7. CTA Section:
   - Heading: "Scale Your ${focusKeyword} Sales with Troika Tech AI Agents"
   - Paragraph 1: 40 words
   - Paragraph 2: 30 words

Topic: ${mainKeyword} focusing on ${focusKeyword}
Total: 1000 words distributed across all sections.

Return content in this JSON format:
{
  "intro": {
    "h1": "...",
    "paragraph1": "...",
    "paragraph2": "..."
  },
  "value": {
    "paragraph": "...",
    "features": ["...", "...", "...", "...", "..."]
  },
  "why": {
    "heading": "...",
    "cards": [
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."}
    ],
    "footnote": "..."
  },
  "features": {
    "heading": "...",
    "boxes": [
      {
        "title": "...",
        "intro": "...",
        "list": ["...", "...", "...", "..."],
        "result": "..."
      },
      {
        "title": "...",
        "intro": "...",
        "list": ["...", "...", "..."],
        "result": "..."
      },
      {
        "title": "...",
        "intro": "...",
        "list": ["...", "...", "...", "...", "..."],
        "result": "..."
      },
      {
        "title": "...",
        "intro": "...",
        "list": ["...", "...", "...", "..."],
        "result": "..."
      },
      {
        "title": "...",
        "intro": "...",
        "list": ["...", "...", "...", "..."],
        "result": "..."
      }
    ]
  },
  "industries": {
    "heading": "...",
    "intro": "...",
    "categories": ["...", "...", "...", "...", "...", "...", "...", "..."]
  },
  "benefits": {
    "heading": "...",
    "cards": [
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."},
      {"title": "...", "desc": "..."}
    ],
    "footnote": "..."
  },
  "cta": {
    "heading": "...",
    "paragraph1": "...",
    "paragraph2": "..."
  }
}`;

  try {
    const requestOptions = {
      model: model,
      messages: [
        { role: 'system', content: 'You are a professional content writer specializing in B2B industry content. Always return valid JSON in the exact format specified.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature
    };

    // Only add response_format if model supports it
    if (supportsJsonMode) {
      requestOptions.response_format = { type: 'json_object' };
    }

    const response = await openaiClient.chat.completions.create(requestOptions);

    let content;
    const responseText = response.choices[0].message.content;

    // Try to parse JSON, handle if it's wrapped in markdown code blocks
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      content = JSON.parse(cleanedText);
    } catch (parseError) {
      // If parsing fails, try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse JSON response from OpenAI');
      }
    }

    // Log token usage information
    const tokenUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens
    };

    const inputCost = (tokenUsage.inputTokens * 0.15) / 1000000; // $0.15 per 1M tokens
    const outputCost = (tokenUsage.outputTokens * 0.60) / 1000000; // $0.60 per 1M tokens
    const totalCost = inputCost + outputCost;

    console.log('[OpenAI Token Usage]');
    console.log(`  Input tokens: ${tokenUsage.inputTokens}`);
    console.log(`  Output tokens: ${tokenUsage.outputTokens}`);
    console.log(`  Total tokens: ${tokenUsage.totalTokens}`);
    console.log(`  Input cost: $${inputCost.toFixed(6)}`);
    console.log(`  Output cost: $${outputCost.toFixed(6)}`);
    console.log(`  Total cost: $${totalCost.toFixed(6)}`);

    // Attach token usage and cost to content object
    content._tokenUsage = tokenUsage;
    content._cost = totalCost;

    return content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw new Error(`OpenAI generation failed: ${error.message}`);
  }
};

/**
 * Analyze an image using OpenAI Vision API and generate metadata
 * @param {Buffer} imageBuffer - Image file buffer
 * @param {string} originalFilename - Original filename
 * @returns {Promise<Object>} Generated metadata including filename, alt text, title, caption, description
 */
const analyzeImage = async (imageBuffer, originalFilename) => {
  if (!openaiClient) {
    await initializeOpenAI();
  }

  if (!openaiClient) {
    throw new Error('OpenAI API key not configured');
  }

  const settings = await Settings.findOne();
  const model = 'gpt-4o'; // Use vision-capable model (gpt-4o or gpt-4o-mini support vision)

  // Convert image buffer to base64
  const base64Image = imageBuffer.toString('base64');
  
  // Get file extension from original filename
  const fileExtension = originalFilename.split('.').pop() || 'jpg';

  const prompt = `Analyze this image and generate SEO-friendly metadata for WordPress media library.

Generate the following:
1. **Filename**: Create a descriptive, SEO-friendly filename (lowercase, hyphens, no spaces, max 50 chars). Base it on what's visible in the image. Include relevant keywords. Example: "ai-agents-businessman-laptop-promotion.jpg"

2. **Alt Text**: Write a descriptive alt text (max 125 characters) that describes what's in the image for accessibility and SEO. Include any visible text, people, objects, and context. Example: "Businessman in white shirt working on laptop with AI Agents promotional banner featuring yellow call-to-action button"

3. **Title**: Create a concise title (max 60 characters) for the image. Example: "AI Agents Business Promotion"

4. **Caption**: Write a brief caption (max 150 characters) that could appear below the image. Example: "Professional businessman showcasing AI Agents technology with modern laptop setup"

5. **Description**: Write a detailed description (max 300 characters) of the image content, including all visible elements, text, colors, and context.

Return your response as a JSON object with these exact keys:
{
  "filename": "generated-filename-without-extension",
  "altText": "descriptive alt text here",
  "title": "Image Title",
  "caption": "Image caption text",
  "description": "Detailed description of the image"
}

Important:
- Filename should be descriptive, SEO-friendly, lowercase, use hyphens
- Alt text should be descriptive and accessible
- All text should be relevant to what's actually visible in the image
- If there's text in the image, mention it in alt text and description`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${fileExtension};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.3, // Lower temperature for more consistent, factual descriptions
      response_format: { type: 'json_object' }
    });

    const responseText = response.choices[0].message.content;
    let metadata;

    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      metadata = JSON.parse(cleanedText);
    } catch (parseError) {
      // If parsing fails, try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        metadata = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse JSON response from OpenAI');
      }
    }

    // Ensure filename has extension
    if (metadata.filename && !metadata.filename.includes('.')) {
      metadata.filename = `${metadata.filename}.${fileExtension}`;
    }

    // Log token usage
    const tokenUsage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens
    };

    // Calculate cost (gpt-4o pricing: $2.50/$10 per 1M tokens for input/output)
    const inputCost = (tokenUsage.inputTokens * 2.50) / 1000000;
    const outputCost = (tokenUsage.outputTokens * 10.00) / 1000000;
    const totalCost = inputCost + outputCost;

    console.log('[OpenAI Image Analysis]');
    console.log(`  Input tokens: ${tokenUsage.inputTokens}`);
    console.log(`  Output tokens: ${tokenUsage.outputTokens}`);
    console.log(`  Total tokens: ${tokenUsage.totalTokens}`);
    console.log(`  Cost: $${totalCost.toFixed(6)}`);

    metadata._tokenUsage = tokenUsage;
    metadata._cost = totalCost;

    return metadata;
  } catch (error) {
    console.error('OpenAI Image Analysis Error:', error);
    throw new Error(`Image analysis failed: ${error.message}`);
  }
};

module.exports = { generateContent, initializeOpenAI, analyzeImage };


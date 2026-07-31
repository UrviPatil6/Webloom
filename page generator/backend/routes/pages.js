const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Template = require('../models/Template');
const Image = require('../models/Image');
const Job = require('../models/Job');
const { generateContent } = require('../services/openaiService');
const { fillTemplate, countWords } = require('../services/templateService');
const { createPage, updatePage } = require('../services/wordpressService');

// Get all pages
router.get('/', async (req, res) => {
  try {
    const { status, templateId, keyword, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (templateId) query.templateId = templateId;
    if (keyword) {
      query.$or = [
        { mainKeyword: { $regex: keyword, $options: 'i' } },
        { focusKeyword: { $regex: keyword, $options: 'i' } }
      ];
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { mainKeyword: { $regex: search, $options: 'i' } },
        { focusKeyword: { $regex: search, $options: 'i' } }
      ];
    }

    const pages = await Page.find(query)
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single page
router.get('/:id', async (req, res) => {
  try {
    const page = await Page.findById(req.params.id).populate('templateId');
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate single page (for testing)
router.post('/generate', async (req, res) => {
  try {
    const { templateId, mainKeyword, focusKeyword, imageSelectionMethod } = req.body;

    if (!templateId || !mainKeyword || !focusKeyword) {
      return res.status(400).json({ error: 'Template ID, main keyword, and focus keyword are required' });
    }

    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Select images
    let selectedImages = [];
    const images = await Image.find();
    
    if (images.length >= 2) {
      if (imageSelectionMethod === 'keyword') {
        // Match by keyword in filename or tags
        const keywordLower = focusKeyword.toLowerCase();
        const matched = images.filter(img => 
          img.filename.toLowerCase().includes(keywordLower) ||
          img.tags.some(tag => tag.toLowerCase().includes(keywordLower))
        );
        selectedImages = matched.length >= 2 
          ? matched.slice(0, 2) 
          : images.slice(0, 2);
      } else {
        // Random selection
        selectedImages = images.sort(() => 0.5 - Math.random()).slice(0, 2);
      }
    }

    // Generate content
    const generatedContent = await generateContent(
      mainKeyword,
      focusKeyword,
      template.wordDistribution
    );

    // Extract token usage and cost from response
    const tokenUsage = generatedContent._tokenUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const generationCost = generatedContent._cost || 0;

    // Prepare images for template
    const templateImages = selectedImages.map((img, index) => ({
      url: img.url,
      alt: `${mainKeyword} ${focusKeyword}`,
      position: index + 1
    }));

    // Fill template
    const filledHtml = fillTemplate(
      template.htmlContent,
      { mainKeyword, focusKeyword, generatedContent },
      templateImages
    );

    // Count words
    const wordCount = countWords(filledHtml);

    // Create page title
    const title = generatedContent.intro?.h1 || `${focusKeyword} - ${mainKeyword}`;

    // Save page
    const page = new Page({
      templateId,
      mainKeyword,
      focusKeyword,
      title,
      generatedContent,
      filledHtml,
      images: templateImages.map((img, index) => ({
        url: img.url,
        alt: img.alt,
        position: img.position,
        imageId: selectedImages[index]._id
      })),
      wordCount,
      tokenUsage: {
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        totalTokens: tokenUsage.totalTokens
      },
      generationCost,
      status: 'draft'
    });

    await page.save();

    // Update image usage count
    for (const img of selectedImages) {
      img.usageCount += 1;
      await img.save();
    }

    res.status(201).json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Publish page to WordPress
router.post('/:id/publish', async (req, res) => {
  try {
    const { status, wordpressConnectionId } = req.body;
    const page = await Page.findById(req.params.id);
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Use provided connectionId or existing one from page
    const connectionId = wordpressConnectionId || page.wordpressConnectionId;

    if (page.wordpressPageId && page.wordpressConnectionId?.toString() === connectionId?.toString()) {
      // Update existing page on same connection
      const result = await updatePage(
        page.wordpressPageId,
        page.title,
        page.filledHtml,
        status || 'publish',
        page.seo, // Pass SEO metadata
        connectionId
      );
      page.status = status || 'published';
      page.wordpressUrl = result.url;
    } else {
      // Create new page (or publish to different connection)
      let featuredMediaId = null;
      if (page.images.length > 0) {
        const img = await Image.findById(page.images[0].imageId);
        if (img) {
          if (connectionId && img.wordpressUploads) {
            const wpUpload = img.wordpressUploads.find(u => u.connectionId.toString() === connectionId.toString());
            featuredMediaId = wpUpload?.mediaId;
          }
          featuredMediaId = featuredMediaId || img.wordpressMediaId;
        }
      }

      const result = await createPage(
        page.title,
        page.filledHtml,
        status || 'publish',
        featuredMediaId,
        page.seo, // Pass SEO metadata
        connectionId
      );

      page.wordpressPageId = result.id;
      page.wordpressUrl = result.url;
      page.wordpressConnectionId = connectionId;
      page.status = status || 'published';
    }

    await page.save();
    res.json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update page
router.put('/:id', async (req, res) => {
  try {
    const { title, filledHtml, status } = req.body;
    const page = await Page.findById(req.params.id);
    
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    if (title) page.title = title;
    if (filledHtml) {
      page.filledHtml = filledHtml;
      page.wordCount = countWords(filledHtml);
    }
    if (status) page.status = status;

    await page.save();
    res.json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete page
router.delete('/:id', async (req, res) => {
  try {
    const page = await Page.findByIdAndDelete(req.params.id);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json({ message: 'Page deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk publish
router.post('/bulk-publish', async (req, res) => {
  try {
    const { pageIds, status, wordpressConnectionId } = req.body;
    if (!pageIds || !Array.isArray(pageIds)) {
      return res.status(400).json({ error: 'Page IDs array is required' });
    }

    const results = { success: [], failed: [] };

    for (const pageId of pageIds) {
      try {
        const page = await Page.findById(pageId);
        if (!page) continue;

        const connectionId = wordpressConnectionId || page.wordpressConnectionId;

        if (page.wordpressPageId && page.wordpressConnectionId?.toString() === connectionId?.toString()) {
          await updatePage(page.wordpressPageId, page.title, page.filledHtml, status || 'publish', page.seo, connectionId);
        } else {
          let featuredMediaId = null;
          if (page.images.length > 0) {
            const img = await Image.findById(page.images[0].imageId);
            if (img) {
              if (connectionId && img.wordpressUploads) {
                const wpUpload = img.wordpressUploads.find(u => u.connectionId.toString() === connectionId.toString());
                featuredMediaId = wpUpload?.mediaId;
              }
              featuredMediaId = featuredMediaId || img.wordpressMediaId;
            }
          }

          const result = await createPage(page.title, page.filledHtml, status || 'publish', featuredMediaId, page.seo, connectionId);
          page.wordpressPageId = result.id;
          page.wordpressUrl = result.url;
          page.wordpressConnectionId = connectionId;
        }

        page.status = status || 'published';
        await page.save();
        results.success.push(pageId);
      } catch (error) {
        results.failed.push({ pageId, error: error.message });
      }
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Page = require('../models/Page');
const Template = require('../models/Template');
const Image = require('../models/Image');
const { generateContent } = require('../services/openaiService');
const { fillTemplate, countWords } = require('../services/templateService');
const { createPage } = require('../services/wordpressService');
const { generateSeoMetadata } = require('../services/seoService');

// Get all jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.find()
      .populate('templateId', 'name')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single job
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('templateId')
      .populate('pagesStatus.pageId');
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create and start generation job
router.post('/generate', async (req, res) => {
  try {
    const { templateId, mainKeyword, focusKeywords, titleConnector, imageSelectionMethod, autoPublish, wordpressConnectionId } = req.body;

    if (!templateId || !mainKeyword || !focusKeywords || !Array.isArray(focusKeywords) || !titleConnector) {
      return res.status(400).json({ error: 'Template ID, main keyword, title connector, and focus keywords array are required' });
    }

    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create job
    const job = new Job({
      templateId,
      mainKeyword,
      titleConnector,
      focusKeywords,
      totalPages: focusKeywords.length,
      pagesStatus: focusKeywords.map(keyword => ({
        focusKeyword: keyword,
        generatedTitle: `${mainKeyword} ${titleConnector} ${keyword}`,
        status: 'pending'
      })),
      status: 'pending',
      autoPublish: autoPublish || false,
      wordpressConnectionId: wordpressConnectionId || null
    });

    await job.save();

    // Start processing asynchronously
    processJob(job._id, imageSelectionMethod, autoPublish, wordpressConnectionId).catch(err => {
      console.error('Job processing error:', err);
    });

    res.status(201).json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process job (async function)
async function processJob(jobId, imageSelectionMethod, autoPublish, connectionId) {
  const job = await Job.findById(jobId);
  if (!job) return;

  // Use connectionId from job if not provided
  const wordpressConnectionId = connectionId || job.wordpressConnectionId;

  job.status = 'processing';
  job.startedAt = new Date();
  await job.save();

  const template = await Template.findById(job.templateId);
  
  // Filter images based on WordPress connection if auto-publish is enabled
  let images;
  let imageWarning = null;
  
  if (autoPublish && wordpressConnectionId) {
    // Only get images that were uploaded to the selected WordPress connection
    images = await Image.find({
      'wordpressUploads.connectionId': wordpressConnectionId
    });
    
    if (images.length === 0) {
      imageWarning = `No images found for the selected WordPress connection. Pages will be generated without images. Please upload images to this connection first.`;
      console.warn(`[Job Processing] ${imageWarning}`);
    } else {
      console.log(`[Job Processing] Found ${images.length} images for WordPress connection ${wordpressConnectionId}`);
    }
  } else {
    // If not auto-publishing or no connection selected, use all images
    images = await Image.find();
  }
  
  // Store warning in job if present
  if (imageWarning) {
    job.error = imageWarning;
    await job.save();
  }

  for (let i = 0; i < job.focusKeywords.length; i++) {
    const focusKeyword = job.focusKeywords[i];
    const pageStatus = job.pagesStatus[i];

    try {
      pageStatus.status = 'processing';
      await job.save();

      // Select images
      let selectedImages = [];
      if (images.length >= 2) {
        if (imageSelectionMethod === 'keyword') {
          const keywordLower = focusKeyword.toLowerCase();
          const matched = images.filter(img => 
            img.filename.toLowerCase().includes(keywordLower) ||
            img.tags.some(tag => tag.toLowerCase().includes(keywordLower))
          );
          selectedImages = matched.length >= 2 
            ? matched.slice(0, 2) 
            : images.slice(0, 2);
        } else {
          selectedImages = images.sort(() => 0.5 - Math.random()).slice(0, 2);
        }
      } else if (images.length === 1) {
        // If only one image available, use it twice
        selectedImages = [images[0], images[0]];
      }

      // Generate content
      const generatedContent = await generateContent(
        job.mainKeyword,
        focusKeyword,
        template.wordDistribution,
        pageStatus.generatedTitle
      );

      // Extract token usage and cost from response
      const tokenUsage = generatedContent._tokenUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
      const pageCost = generatedContent._cost || 0;

      // Store token usage in page status
      pageStatus.tokenUsage = tokenUsage;
      pageStatus.cost = pageCost;

      // Update total job token usage
      job.totalTokenUsage.inputTokens += tokenUsage.inputTokens;
      job.totalTokenUsage.outputTokens += tokenUsage.outputTokens;
      job.totalTokenUsage.totalTokens += tokenUsage.totalTokens;
      job.totalCost += pageCost;

      // Prepare images
      const templateImages = selectedImages.map((img, index) => ({
        url: img.url,
        alt: `${job.mainKeyword} ${focusKeyword}`,
        position: index + 1
      }));

      // Fill template
      const filledHtml = fillTemplate(
        template.htmlContent,
        { mainKeyword: job.mainKeyword, focusKeyword, generatedContent },
        templateImages
      );

      const wordCount = countWords(filledHtml);
      const title = pageStatus.generatedTitle;

      // Generate SEO metadata (pass titleConnector for compulsory 3-component format)
      const seoMetadata = generateSeoMetadata(job.mainKeyword, focusKeyword, title, job.titleConnector);

      // Create page
      const page = new Page({
        templateId: job.templateId,
        mainKeyword: job.mainKeyword,
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
        seo: {
          metaTitle: seoMetadata.metaTitle,
          metaDescription: seoMetadata.metaDescription,
          focusKeyphrase: seoMetadata.focusKeyphrase
        },
        tokenUsage: {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens
        },
        generationCost: pageCost,
        status: 'draft',
        jobId: job._id
      });

      await page.save();

      // Update image usage
      for (const img of selectedImages) {
        img.usageCount += 1;
        await img.save();
      }

      // Auto-publish if enabled
      if (autoPublish && wordpressConnectionId) {
        try {
          // Get featured media ID from first image's WordPress uploads matching the connection
          let featuredMediaId = null;
          if (selectedImages[0]) {
            const img = selectedImages[0];
            const wpUpload = img.wordpressUploads?.find(u => u.connectionId.toString() === wordpressConnectionId.toString());
            featuredMediaId = wpUpload?.mediaId || img.wordpressMediaId;
          }
          
          const result = await createPage(title, filledHtml, 'publish', featuredMediaId, seoMetadata, wordpressConnectionId);
          page.wordpressPageId = result.id;
          page.wordpressUrl = result.url;
          page.wordpressConnectionId = wordpressConnectionId;
          page.status = 'published';
          await page.save();
        } catch (error) {
          console.error('Auto-publish failed:', error);
        }
      }

      pageStatus.status = 'completed';
      pageStatus.pageId = page._id;
      job.progress = Math.round(((i + 1) / job.totalPages) * 100);
      await job.save();

    } catch (error) {
      pageStatus.status = 'failed';
      pageStatus.error = error.message;
      await job.save();
    }
  }

  job.status = 'completed';
  job.completedAt = new Date();
  await job.save();
}

// Cancel job
router.post('/:id/cancel', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status === 'completed' || job.status === 'cancelled') {
      return res.status(400).json({ error: 'Job cannot be cancelled' });
    }

    job.status = 'cancelled';
    await job.save();
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Retry failed pages
router.post('/:id/retry', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const failedPages = job.pagesStatus.filter(p => p.status === 'failed');
    if (failedPages.length === 0) {
      return res.json({ message: 'No failed pages to retry' });
    }

    // Reset failed pages
    for (const pageStatus of failedPages) {
      pageStatus.status = 'pending';
      pageStatus.error = null;
    }

    job.status = 'processing';
    await job.save();

    // Process failed pages
    // (Similar to processJob but only for failed pages)

    res.json(job);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


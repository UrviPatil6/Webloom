const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const { extractPlaceholders, extractImageSlots } = require('../services/templateService');

// Get all templates
router.get('/', async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single template
router.get('/:id', async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create template
router.post('/', async (req, res) => {
  try {
    const { name, description, htmlContent, category, tags } = req.body;

    if (!name || !htmlContent) {
      return res.status(400).json({ error: 'Name and HTML content are required' });
    }

    // Auto-extract placeholders and image slots
    const placeholders = extractPlaceholders(htmlContent);
    const imageSlots = extractImageSlots(htmlContent);

    const template = new Template({
      name,
      description: description || '',
      htmlContent,
      placeholders,
      imageSlots,
      category: category || 'general',
      tags: tags || []
    });

    await template.save();
    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update template
router.put('/:id', async (req, res) => {
  try {
    const { name, description, htmlContent, placeholders, imageSlots, category, tags } = req.body;

    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // If HTML content changed, re-extract placeholders
    if (htmlContent && htmlContent !== template.htmlContent) {
      const extractedPlaceholders = extractPlaceholders(htmlContent);
      const extractedImageSlots = extractImageSlots(htmlContent);
      
      template.htmlContent = htmlContent;
      template.placeholders = placeholders || extractedPlaceholders;
      template.imageSlots = imageSlots || extractedImageSlots;
    }

    if (name) template.name = name;
    if (description !== undefined) template.description = description;
    if (category) template.category = category;
    if (tags) template.tags = tags;
    if (placeholders) template.placeholders = placeholders;
    if (imageSlots) template.imageSlots = imageSlots;

    await template.save();
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete template
router.delete('/:id', async (req, res) => {
  try {
    const template = await Template.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test template with sample data
router.post('/:id/test', async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { fillTemplate } = require('../services/templateService');
    const sampleData = {
      mainKeyword: req.body.mainKeyword || 'AI Agents',
      focusKeyword: req.body.focusKeyword || 'Sample Industry',
      generatedContent: req.body.sampleContent || {
        intro: {
          h1: 'Best AI Agents for AI Agents - Sample Industry',
          paragraph1: 'This is a sample introduction paragraph for testing the template.',
          paragraph2: 'This is the second paragraph with more details about the industry.'
        }
      }
    };

    const sampleImages = req.body.sampleImages || [
      { url: 'https://via.placeholder.com/800x600', alt: 'Sample Image 1' },
      { url: 'https://via.placeholder.com/800x600', alt: 'Sample Image 2' }
    ];

    const filledHtml = fillTemplate(template.htmlContent, sampleData, sampleImages);
    res.json({ filledHtml });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { testConnection } = require('../services/wordpressService');

// Get WordPress settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
      await settings.save();
    }
    res.json({
      ...settings.wordpress,
      contentMethod: settings.publishing.contentMethod || 'html_block'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update WordPress settings
router.put('/settings', async (req, res) => {
  try {
    const { siteUrl, username, appPassword, contentMethod } = req.body;

    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }

    settings.wordpress.siteUrl = siteUrl || settings.wordpress.siteUrl;
    settings.wordpress.username = username || settings.wordpress.username;
    if (appPassword) {
      settings.wordpress.appPassword = appPassword;
    }
    
    if (contentMethod) {
      settings.publishing.contentMethod = contentMethod;
    }

    await settings.save();
    res.json({
      ...settings.wordpress,
      contentMethod: settings.publishing.contentMethod
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test WordPress connection
router.post('/test', async (req, res) => {
  try {
    console.log('Testing WordPress connection...');
    const result = await testConnection();
    console.log('Connection test successful');
    
    let settings = await Settings.findOne();
    if (!settings) {
      console.log('Creating new Settings document');
      settings = new Settings();
    }
    settings.wordpress.connected = true;
    settings.wordpress.lastTested = new Date();
    await settings.save();
    console.log('Settings updated successfully');
    
    res.json(result);
  } catch (error) {
    console.error('WordPress test error:', error);
    
    try {
      let settings = await Settings.findOne();
      if (!settings) {
        settings = new Settings();
      }
      settings.wordpress.connected = false;
      await settings.save();
    } catch (saveError) {
      console.error('Error saving settings:', saveError);
    }
    
    // Return appropriate status code based on error type
    const statusCode = error.message.includes('not found') || 
                      error.message.includes('not configured') ||
                      error.message.includes('required') ||
                      error.message.includes('Invalid') 
                      ? 400 
                      : 500;
    
    res.status(statusCode).json({ error: error.message });
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Job = require('../models/Job');
const Template = require('../models/Template');
const Image = require('../models/Image');

// Get dashboard overview
router.get('/overview', async (req, res) => {
  try {
    const totalPages = await Page.countDocuments();
    const publishedPages = await Page.countDocuments({ status: 'published' });
    const draftPages = await Page.countDocuments({ status: 'draft' });
    const templates = await Template.countDocuments();
    const images = await Image.countDocuments();
    
    const jobs = await Job.find();
    const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending').length;
    const completedJobs = jobs.filter(j => j.status === 'completed').length;
    const successRate = jobs.length > 0 
      ? Math.round((completedJobs / jobs.length) * 100) 
      : 0;

    res.json({
      totalPages,
      publishedPages,
      draftPages,
      templates,
      images,
      activeJobs,
      successRate
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pages over time
router.get('/pages-over-time', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const pages = await Page.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pages by status
router.get('/pages-by-status', async (req, res) => {
  try {
    const statusCounts = await Page.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(statusCounts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top keywords
router.get('/top-keywords', async (req, res) => {
  try {
    const keywords = await Page.aggregate([
      {
        $group: {
          _id: '$focusKeyword',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    res.json(keywords);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


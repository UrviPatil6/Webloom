const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/templates', require('./routes/templates'));
app.use('/api/images', require('./routes/images'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/wordpress', require('./routes/wordpress'));
app.use('/api/wordpress/connections', require('./routes/wordpressConnections'));
app.use('/api/analytics', require('./routes/analytics'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/page-generator')
.then(async () => {
  console.log('MongoDB connected');
  // Initialize default settings if they don't exist
  const Settings = require('./models/Settings');
  const WordPressConnection = require('./models/WordPressConnection');
  
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      console.log('Creating default settings...');
      await new Settings().save();
      console.log('Default settings created');
    }

    // Migration: Convert existing Settings WordPress connection to WordPressConnection
    const existingConnections = await WordPressConnection.countDocuments();
    if (existingConnections === 0 && settings && settings.wordpress && settings.wordpress.siteUrl) {
      console.log('Migrating existing WordPress settings to WordPressConnection...');
      try {
        const connection = new WordPressConnection({
          name: 'Default Connection',
          siteUrl: settings.wordpress.siteUrl,
          username: settings.wordpress.username,
          appPassword: settings.wordpress.appPassword,
          contentMethod: settings.publishing?.contentMethod || 'html_block',
          connected: settings.wordpress.connected || false,
          lastTested: settings.wordpress.lastTested,
          isDefault: true
        });
        await connection.save();
        console.log('WordPress settings migrated successfully');
      } catch (migrationError) {
        console.error('Error migrating WordPress settings:', migrationError);
      }
    }
  } catch (err) {
    console.error('Error checking settings:', err);
  }
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  console.error('Make sure MongoDB is running: mongod');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


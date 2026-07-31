const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  wordpress: {
    siteUrl: { type: String, default: '' },
    username: { type: String, default: '' },
    appPassword: { type: String, default: '' },
    connected: { type: Boolean, default: false },
    lastTested: { type: Date }
  },
  openai: {
    model: { type: String, default: 'gpt-4o-mini' },
    maxTokens: { type: Number, default: 2000 },
    temperature: { type: Number, default: 0.7 }
  },
  publishing: {
    defaultStatus: { type: String, enum: ['draft', 'publish'], default: 'draft' },
    defaultAuthor: { type: Number, default: 1 },
    batchSize: { type: Number, default: 10 },
    contentMethod: { type: String, enum: ['direct', 'html_block', 'elementor'], default: 'html_block' }
  },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Settings', settingsSchema);


const mongoose = require('mongoose');

const pageStatusSchema = new mongoose.Schema({
  focusKeyword: { type: String, required: true },
  generatedTitle: { type: String },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Page' },
  error: { type: String },
  tokenUsage: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 }
  },
  cost: { type: Number, default: 0 }
});

const jobSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  mainKeyword: { type: String, required: true },
  titleConnector: { type: String, required: true },
  focusKeywords: [String],
  totalPages: { type: Number, required: true },
  pagesStatus: [pageStatusSchema],
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  progress: { type: Number, default: 0 },
  startedAt: { type: Date },
  completedAt: { type: Date },
  error: { type: String },
  totalTokenUsage: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 }
  },
  totalCost: { type: Number, default: 0 },
  wordpressConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WordPressConnection' },
  autoPublish: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Job', jobSchema);


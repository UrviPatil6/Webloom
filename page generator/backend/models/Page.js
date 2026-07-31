const mongoose = require('mongoose');

const imageReferenceSchema = new mongoose.Schema({
  url: { type: String, required: true },
  alt: { type: String, required: true },
  position: { type: Number, required: true },
  imageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }
});

const pageSchema = new mongoose.Schema({
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', required: true },
  mainKeyword: { type: String, required: true },
  focusKeyword: { type: String, required: true },
  title: { type: String, required: true },
  generatedContent: { type: mongoose.Schema.Types.Mixed },
  filledHtml: { type: String, required: true },
  images: [imageReferenceSchema],
  wordCount: { type: Number, default: 0 },
  wordpressPageId: { type: Number },
  wordpressUrl: { type: String },
  wordpressConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WordPressConnection' },
  status: {
    type: String,
    enum: ['draft', 'published', 'failed'],
    default: 'draft'
  },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  seo: {
    metaTitle: { type: String },
    metaDescription: { type: String },
    focusKeyphrase: { type: String }
  },
  tokenUsage: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 }
  },
  generationCost: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

pageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Page', pageSchema);


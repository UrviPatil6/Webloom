const mongoose = require('mongoose');

const placeholderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['keyword', 'content', 'image'], required: true },
  wordLimit: { type: Number, default: null },
  required: { type: Boolean, default: true }
});

const imageSlotSchema = new mongoose.Schema({
  position: { type: Number, required: true },
  urlPlaceholder: { type: String, required: true },
  altPlaceholder: { type: String, required: true }
});

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  htmlContent: { type: String, required: true },
  placeholders: [placeholderSchema],
  imageSlots: [imageSlotSchema],
  wordDistribution: {
    intro: { type: Number, default: 150 },
    value: { type: Number, default: 100 },
    why: { type: Number, default: 150 },
    features: { type: Number, default: 350 },
    industries: { type: Number, default: 50 },
    benefits: { type: Number, default: 100 },
    cta: { type: Number, default: 50 }
  },
  category: { type: String, default: 'general' },
  tags: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

templateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Template', templateSchema);


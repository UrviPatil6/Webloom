const mongoose = require('mongoose');

const wordPressUploadSchema = new mongoose.Schema({
  connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WordPressConnection', required: true },
  mediaId: { type: Number, required: true },
  url: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const imageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  wordpressMediaId: { type: Number }, // Legacy field, kept for backward compatibility
  url: { type: String, required: true },
  altText: { type: String, default: '' },
  tags: [String],
  category: { type: String, default: 'general' },
  description: { type: String, default: '' },
  width: { type: Number },
  height: { type: Number },
  fileSize: { type: Number },
  uploadedAt: { type: Date, default: Date.now },
  usageCount: { type: Number, default: 0 },
  wordpressUploads: [wordPressUploadSchema] // Array of WordPress uploads to different sites
});

module.exports = mongoose.model('Image', imageSchema);


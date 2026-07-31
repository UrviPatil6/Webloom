const mongoose = require('mongoose');
const crypto = require('crypto');

// Simple encryption/decryption functions
const algorithm = 'aes-256-cbc';
// Use a fixed key from env or generate one (in production, use a proper key management system)
let secretKey = process.env.ENCRYPTION_KEY;
if (!secretKey) {
  // Generate a 32-byte key and convert to hex (64 chars)
  secretKey = crypto.randomBytes(32).toString('hex');
  console.warn('WARNING: Using auto-generated encryption key. Set ENCRYPTION_KEY in environment for production.');
}

// Ensure key is exactly 32 bytes (64 hex characters)
const getKey = () => {
  if (secretKey.length >= 64) {
    return Buffer.from(secretKey.slice(0, 64), 'hex');
  }
  // Pad or truncate to 32 bytes
  const keyBuffer = Buffer.alloc(32);
  const sourceBuffer = Buffer.from(secretKey, 'utf8');
  sourceBuffer.copy(keyBuffer, 0, 0, Math.min(32, sourceBuffer.length));
  return keyBuffer;
};

const encrypt = (text) => {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const key = getKey();
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Return plain text if encryption fails
  }
};

const decrypt = (text) => {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 2) return text; // Not encrypted, return as-is
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const key = getKey();
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // If decryption fails, might be plain text (for backward compatibility)
    return text;
  }
};

const wordPressConnectionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  siteUrl: { type: String, required: true },
  username: { type: String, required: true },
  appPassword: { 
    type: String, 
    required: true,
    get: decrypt,
    set: encrypt
  },
  contentMethod: { 
    type: String, 
    enum: ['html_block', 'direct', 'elementor'], 
    default: 'html_block' 
  },
  connected: { type: Boolean, default: false },
  lastTested: { type: Date },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Ensure only one default connection
wordPressConnectionSchema.pre('save', async function(next) {
  if (this.isDefault) {
    await mongoose.model('WordPressConnection').updateMany(
      { _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  this.updatedAt = Date.now();
  next();
});

// Virtual to get decrypted password for API responses (exclude from JSON)
wordPressConnectionSchema.methods.getDecryptedPassword = function() {
  try {
    // Get raw password value without getter
    const rawPassword = this.get('appPassword', null, { getters: false });
    if (!rawPassword) {
      console.warn('[WordPressConnection] No password found for connection:', this._id);
      return '';
    }
    
    const decrypted = decrypt(rawPassword);
    
    // If decryption returned the same value (plain text), return it
    // This handles backward compatibility with plain text passwords
    if (decrypted === rawPassword) {
      console.log('[WordPressConnection] Password appears to be plain text (not encrypted)');
      return decrypted;
    }
    
    // If decrypted value is empty or same as encrypted, decryption might have failed
    if (!decrypted || decrypted.trim() === '') {
      console.warn('[WordPressConnection] Password decryption returned empty result');
      // Try returning raw password as fallback (might be plain text)
      return rawPassword;
    }
    
    return decrypted;
  } catch (error) {
    console.error('[WordPressConnection] Error decrypting password:', error);
    // Return raw password as fallback
    return this.get('appPassword', null, { getters: false }) || '';
  }
};

// Method to get connection details without password
wordPressConnectionSchema.methods.toSafeJSON = function() {
  const obj = this.toObject();
  delete obj.appPassword;
  return obj;
};

module.exports = mongoose.model('WordPressConnection', wordPressConnectionSchema);


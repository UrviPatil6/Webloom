const express = require('express');
const router = express.Router();
const WordPressConnection = require('../models/WordPressConnection');
const { testConnectionWithCredentials } = require('../services/wordpressService');

// Get all connections
router.get('/', async (req, res) => {
  try {
    const connections = await WordPressConnection.find().sort({ isDefault: -1, createdAt: -1 });
    // Return safe JSON without passwords
    const safeConnections = connections.map(conn => conn.toSafeJSON());
    res.json(safeConnections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single connection (without password)
router.get('/:id', async (req, res) => {
  try {
    const connection = await WordPressConnection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    res.json(connection.toSafeJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get default connection
router.get('/default/active', async (req, res) => {
  try {
    const connection = await WordPressConnection.findOne({ isDefault: true });
    if (!connection) {
      // Return first connection if no default set
      const firstConnection = await WordPressConnection.findOne().sort({ createdAt: 1 });
      if (firstConnection) {
        return res.json(firstConnection.toSafeJSON());
      }
      return res.status(404).json({ error: 'No WordPress connection found' });
    }
    res.json(connection.toSafeJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new connection
router.post('/', async (req, res) => {
  try {
    const { name, siteUrl, username, appPassword, contentMethod, isDefault } = req.body;

    if (!name || !siteUrl || !username || !appPassword) {
      return res.status(400).json({ error: 'Name, site URL, username, and app password are required' });
    }

    // Validate URL format
    try {
      new URL(siteUrl);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid site URL format' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await WordPressConnection.updateMany({}, { $set: { isDefault: false } });
    }

    const connection = new WordPressConnection({
      name,
      siteUrl: siteUrl.replace(/\/$/, ''), // Remove trailing slash
      username,
      appPassword,
      contentMethod: contentMethod || 'html_block',
      isDefault: isDefault || false
    });

    await connection.save();
    res.status(201).json(connection.toSafeJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update connection
router.put('/:id', async (req, res) => {
  try {
    const { name, siteUrl, username, appPassword, contentMethod, isDefault } = req.body;
    const connection = await WordPressConnection.findById(req.params.id);

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    if (name) connection.name = name;
    if (siteUrl) {
      try {
        new URL(siteUrl);
        connection.siteUrl = siteUrl.replace(/\/$/, '');
      } catch (e) {
        return res.status(400).json({ error: 'Invalid site URL format' });
      }
    }
    if (username) connection.username = username;
    if (appPassword) connection.appPassword = appPassword;
    if (contentMethod) connection.contentMethod = contentMethod;
    if (isDefault !== undefined) {
      connection.isDefault = isDefault;
      // If setting as default, unset other defaults
      if (isDefault) {
        await WordPressConnection.updateMany(
          { _id: { $ne: connection._id } },
          { $set: { isDefault: false } }
        );
      }
    }

    await connection.save();
    res.json(connection.toSafeJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete connection
router.delete('/:id', async (req, res) => {
  try {
    const connection = await WordPressConnection.findByIdAndDelete(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    res.json({ message: 'Connection deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test connection
router.post('/:id/test', async (req, res) => {
  try {
    const connection = await WordPressConnection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    console.log(`[Test Connection] Testing connection: ${connection.name}`);
    console.log(`[Test Connection] Site URL: ${connection.siteUrl}`);
    console.log(`[Test Connection] Username: ${connection.username}`);

    // Get the raw appPassword from the database (not decrypted via getter)
    const rawPassword = connection.get('appPassword', null, { getters: false });
    console.log(`[Test Connection] Raw password length: ${rawPassword ? rawPassword.length : 0}`);

    let decryptedPassword;
    try {
      decryptedPassword = connection.getDecryptedPassword();
      if (!decryptedPassword || decryptedPassword.trim() === '') {
        throw new Error('Password decryption returned empty result. The password may not be properly encrypted or the encryption key may have changed.');
      }
      console.log(`[Test Connection] Password decrypted successfully, length: ${decryptedPassword.length}`);
    } catch (decryptError) {
      console.error('[Test Connection] Password decryption error:', decryptError);
      return res.status(400).json({ 
        error: 'Failed to decrypt password. Please update the connection with a new application password. The encryption key may have changed or the password was not properly saved.',
        details: decryptError.message
      });
    }
    
    try {
      const result = await testConnectionWithCredentials(
        connection.siteUrl,
        connection.username,
        decryptedPassword
      );
      
      connection.connected = true;
      connection.lastTested = new Date();
      await connection.save();
      
      console.log(`[Test Connection] ✓ Connection successful for: ${connection.name}`);
      res.json({ ...result, connection: connection.toSafeJSON() });
    } catch (error) {
      connection.connected = false;
      await connection.save();
      
      console.error(`[Test Connection] ✗ Connection failed for: ${connection.name}`, {
        status: error.response?.status,
        message: error.message,
        details: error.response?.data
      });
      
      let errorMessage = error.message;
      
      // Provide more helpful error messages
      if (error.response?.status === 401) {
        errorMessage = 'Authentication failed. Please check:\n' +
          '1. Username is correct\n' +
          '2. Application password is correct (WordPress shows it only once)\n' +
          '3. Application password hasn\'t been revoked in WordPress\n' +
          '4. Try creating a new application password in WordPress';
      } else if (error.response?.status === 404) {
        errorMessage = 'WordPress REST API not found. Make sure:\n' +
          '1. Your WordPress site has REST API enabled\n' +
          '2. The site URL is correct (should be like https://yoursite.com, not https://yoursite.com/wp-admin)';
      } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        errorMessage = `Cannot connect to WordPress site at ${connection.siteUrl}.\n` +
          'Please check:\n' +
          '1. The site URL is correct\n' +
          '2. The site is accessible\n' +
          '3. There are no firewall restrictions';
      }
      
      const statusCode = error.message.includes('not found') || 
                        error.message.includes('not configured') ||
                        error.message.includes('required') ||
                        error.message.includes('Invalid') 
                        ? 400 
                        : error.response?.status || 500;
      
      res.status(statusCode).json({ 
        error: errorMessage,
        details: error.response?.data || error.message
      });
    }
  } catch (error) {
    console.error('[Test Connection] Unexpected error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Set as default
router.put('/:id/default', async (req, res) => {
  try {
    const connection = await WordPressConnection.findById(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Unset all other defaults
    await WordPressConnection.updateMany({}, { $set: { isDefault: false } });
    
    // Set this as default
    connection.isDefault = true;
    await connection.save();
    
    res.json(connection.toSafeJSON());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


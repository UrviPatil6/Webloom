const axios = require('axios');
const FormData = require('form-data');
const Settings = require('../models/Settings');
const WordPressConnection = require('../models/WordPressConnection');

// Helper function to create auth header
const createAuthHeader = (username, appPassword) => {
  const cleanAppPassword = appPassword.replace(/\s+/g, '');
  return Buffer.from(`${username}:${cleanAppPassword}`).toString('base64');
};

// Test connection with provided credentials
const testConnectionWithCredentials = async (siteUrl, username, appPassword) => {
  if (!siteUrl || !siteUrl.trim()) {
    throw new Error('WordPress site URL is required. Please enter your WordPress site URL.');
  }

  if (!username || !username.trim()) {
    throw new Error('WordPress username is required. Please enter your WordPress username.');
  }

  if (!appPassword || !appPassword.trim()) {
    throw new Error('WordPress application password is required. Please create an application password in WordPress.');
  }

  // Validate URL format
  try {
    new URL(siteUrl);
  } catch (e) {
    throw new Error('Invalid WordPress site URL format. Please enter a valid URL (e.g., https://yoursite.com)');
  }

  // Remove trailing slash if present
  const cleanSiteUrl = siteUrl.replace(/\/$/, '');
  const auth = createAuthHeader(username, appPassword);

  try {
    const response = await axios.get(`${cleanSiteUrl}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': `Basic ${auth}`
      },
      timeout: 10000 // 10 second timeout
    });
    return { connected: true, user: response.data };
  } catch (error) {
    if (error.response) {
      // WordPress API returned an error response
      const status = error.response.status;
      const message = error.response.data?.message || error.message;
      
      if (status === 401) {
        throw new Error('Authentication failed. Please check your username and application password.');
      } else if (status === 404) {
        throw new Error('WordPress REST API not found. Make sure your WordPress site has REST API enabled.');
      } else {
        throw new Error(`WordPress API error (${status}): ${message}`);
      }
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Cannot connect to WordPress site. Please check the site URL and ensure the site is accessible.');
    } else {
      // Error setting up the request
      throw new Error(`Connection error: ${error.message}`);
    }
  }
};

// Test connection using Settings (legacy support)
const testConnection = async () => {
  const settings = await Settings.findOne();
  if (!settings) {
    throw new Error('WordPress settings not found. Please configure WordPress settings first.');
  }

  const { siteUrl, username, appPassword } = settings.wordpress;
  return await testConnectionWithCredentials(siteUrl, username, appPassword);
};

// Get connection credentials by ID
const getConnectionCredentials = async (connectionId) => {
  if (!connectionId) {
    // Fallback to default connection or Settings
    const defaultConnection = await WordPressConnection.findOne({ isDefault: true });
    if (defaultConnection) {
      const appPassword = defaultConnection.getDecryptedPassword();
      if (!appPassword) {
        throw new Error('WordPress connection password is missing or could not be decrypted. Please update the connection with a valid application password.');
      }
      return {
        siteUrl: defaultConnection.siteUrl,
        username: defaultConnection.username,
        appPassword: appPassword,
        contentMethod: defaultConnection.contentMethod
      };
    }
    // Legacy: fallback to Settings
    const settings = await Settings.findOne();
    if (settings && settings.wordpress.siteUrl) {
      if (!settings.wordpress.appPassword) {
        throw new Error('WordPress application password is missing. Please configure it in WordPress Settings.');
      }
      return {
        siteUrl: settings.wordpress.siteUrl,
        username: settings.wordpress.username,
        appPassword: settings.wordpress.appPassword,
        contentMethod: settings.publishing.contentMethod || 'html_block'
      };
    }
    throw new Error('WordPress connection not found. Please configure a WordPress connection.');
  }

  const connection = await WordPressConnection.findById(connectionId);
  if (!connection) {
    throw new Error(`WordPress connection with ID ${connectionId} not found. Please check your connection settings.`);
  }

  const appPassword = connection.getDecryptedPassword();
  if (!appPassword) {
    throw new Error('WordPress connection password is missing or could not be decrypted. Please update the connection with a valid application password.');
  }

  return {
    siteUrl: connection.siteUrl,
    username: connection.username,
    appPassword: appPassword,
    contentMethod: connection.contentMethod
  };
};

const setYoastSEO = async (siteUrl, pageId, seoMetadata, auth) => {
  if (!seoMetadata) return;

  try {
    console.log('[Yoast SEO] Attempting to set Yoast SEO for page:', pageId);
    console.log('[Yoast SEO] Title:', seoMetadata.metaTitle);
    console.log('[Yoast SEO] Description:', seoMetadata.metaDescription);
    console.log('[Yoast SEO] Keyphrase:', seoMetadata.focusKeyphrase);

    // Since REST API meta fields aren't being persisted, we'll use the Yoast Settings API endpoint
    // This is more direct and reliable for setting Yoast SEO data

    // First, try the Yoast-specific meta update via direct database-like approach
    // Some WordPress/Yoast setups require using wp/v2/pages with _fields parameter
    const yoastPayload = {
      meta: {
        '_yoast_wpseo_title': seoMetadata.metaTitle || '',
        '_yoast_wpseo_metadesc': seoMetadata.metaDescription || '',
        '_yoast_wpseo_focuskw': seoMetadata.focusKeyphrase || '',
        '_yoast_wpseo_focuskeywords': JSON.stringify([{
          keyword: seoMetadata.focusKeyphrase || '',
          score: 'na'
        }])
      }
    };

    console.log('[Yoast SEO] Sending Yoast meta to:', siteUrl + '/wp-json/wp/v2/pages/' + pageId);

    await axios.post(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}`,
      yoastPayload,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('[Yoast SEO] Update request completed.');

    // Give WordPress a moment to process, then verify
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify the fields were actually set
    const verifyResponse = await axios.get(
      `${siteUrl}/wp-json/wp/v2/pages/${pageId}?_fields=meta`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    console.log('[Yoast SEO] VERIFICATION - Full meta object:', verifyResponse.data.meta);

    const hasYoastFields = verifyResponse.data.meta && (
      verifyResponse.data.meta._yoast_wpseo_title ||
      verifyResponse.data.meta._yoast_wpseo_metadesc ||
      verifyResponse.data.meta._yoast_wpseo_focuskw
    );

    if (hasYoastFields) {
      console.log('[Yoast SEO] ✓ SUCCESS - Yoast fields persisted in WordPress database!');
      console.log('[Yoast SEO] - Title:', verifyResponse.data.meta._yoast_wpseo_title || 'NOT SET');
      console.log('[Yoast SEO] - Description:', verifyResponse.data.meta._yoast_wpseo_metadesc || 'NOT SET');
      console.log('[Yoast SEO] - Keyphrase:', verifyResponse.data.meta._yoast_wpseo_focuskw || 'NOT SET');
    } else {
      console.warn('[Yoast SEO] ⚠ WARNING - Yoast fields were not persisted. This may require enabling meta field registration in Yoast settings.');
      console.log('[Yoast SEO] Available meta fields:', Object.keys(verifyResponse.data.meta || {}));
    }

    return hasYoastFields;
  } catch (error) {
    console.error('[Yoast SEO] Error setting Yoast SEO:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    return false;
  }
};

const uploadImage = async (imageBuffer, filename, altText = '', connectionId = null, metadata = {}) => {
  try {
    const credentials = await getConnectionCredentials(connectionId);
    
    if (!credentials.siteUrl || !credentials.username || !credentials.appPassword) {
      throw new Error('WordPress connection credentials are incomplete. Please check your connection settings.');
    }

    const auth = createAuthHeader(credentials.username, credentials.appPassword);

    const formData = new FormData();
    formData.append('file', imageBuffer, filename);
    
    // Set all metadata fields
    if (altText || metadata.altText) {
      formData.append('alt_text', altText || metadata.altText || '');
    }
    if (metadata.title) {
      formData.append('title', metadata.title);
    }
    if (metadata.caption) {
      formData.append('caption', metadata.caption);
    }
    if (metadata.description) {
      formData.append('description', metadata.description);
    }

    console.log(`[WordPress Upload] Uploading to: ${credentials.siteUrl}`);
    console.log(`[WordPress Upload] Filename: ${filename}`);
    console.log(`[WordPress Upload] Username: ${credentials.username}`);

    const response = await axios.post(`${credentials.siteUrl}/wp-json/wp/v2/media`, formData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        ...formData.getHeaders()
      },
      timeout: 30000 // 30 second timeout
    });

    // After upload, update metadata via REST API to ensure all fields are set
    // Sometimes WordPress doesn't accept all fields during initial upload
    if (metadata.title || metadata.caption || metadata.description) {
      try {
        const updateData = {};
        if (metadata.title) updateData.title = metadata.title;
        if (metadata.caption) updateData.caption = metadata.caption;
        if (metadata.description) updateData.description = metadata.description;

        await axios.post(
          `${credentials.siteUrl}/wp-json/wp/v2/media/${response.data.id}`,
          updateData,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (updateError) {
        console.warn('Failed to update image metadata after upload:', updateError.message);
        // Continue even if metadata update fails
      }
    }

    return {
      id: response.data.id,
      url: response.data.source_url,
      mediaDetails: response.data.media_details
    };
  } catch (error) {
    console.error('[WordPress Upload Error]', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      data: error.response?.data
    });

    if (error.response?.status === 401) {
      throw new Error('WordPress authentication failed. Please check your username and application password. Make sure the application password is correct and the connection is properly configured.');
    } else if (error.response?.status === 404) {
      throw new Error('WordPress REST API not found. Make sure your WordPress site has REST API enabled.');
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw new Error(`Cannot connect to WordPress site at ${credentials?.siteUrl}. Please check the site URL and ensure the site is accessible.`);
    } else {
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`Image upload failed: ${errorMessage}`);
    }
  }
};

/**
 * Delete media from WordPress
 * @param {number} mediaId - WordPress media ID
 * @param {string} connectionId - WordPress connection ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
const deleteMedia = async (mediaId, connectionId) => {
  try {
    const credentials = await getConnectionCredentials(connectionId);
    
    if (!credentials.siteUrl || !credentials.username || !credentials.appPassword) {
      throw new Error('WordPress connection credentials are incomplete.');
    }

    const auth = createAuthHeader(credentials.username, credentials.appPassword);

    console.log(`[WordPress Delete] Deleting media ID ${mediaId} from ${credentials.siteUrl}`);

    // WordPress REST API requires force=true parameter to permanently delete media
    const response = await axios.delete(
      `${credentials.siteUrl}/wp-json/wp/v2/media/${mediaId}?force=true`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        },
        timeout: 10000
      }
    );

    console.log(`[WordPress Delete] ✓ Successfully deleted media ID ${mediaId}`);
    return true;
  } catch (error) {
    console.error('[WordPress Delete Error]', {
      mediaId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      message: error.message,
      data: error.response?.data
    });

    // If media is already deleted (404) or doesn't exist, consider it successful
    if (error.response?.status === 404) {
      console.log(`[WordPress Delete] Media ID ${mediaId} not found (may already be deleted)`);
      return true;
    }

    // If unauthorized, throw error
    if (error.response?.status === 401) {
      throw new Error('WordPress authentication failed. Cannot delete media.');
    }

    // For other errors, throw with details
    const errorMessage = error.response?.data?.message || error.message;
    throw new Error(`Failed to delete media from WordPress: ${errorMessage}`);
  }
};

/**
 * Convert HTML to Gutenberg HTML block format
 */
const htmlToBlockFormat = (htmlContent) => {
  // Gutenberg block format for HTML block
  const blocks = [
    {
      blockName: 'core/html',
      attrs: {},
      innerBlocks: [],
      innerHTML: htmlContent,
      innerContent: [htmlContent]
    }
  ];

  // Return as Gutenberg block format
  return {
    blocks: blocks,
    version: 2
  };
};

/**
 * Convert HTML to Elementor widget format
 */
const htmlToElementorFormat = (htmlContent) => {
  // Elementor page structure with HTML widget
  // Elementor stores data as JSON array of sections/columns/widgets
  const timestamp = Date.now();
  const sectionId = `section_${timestamp}`;
  const columnId = `column_${timestamp}`;
  const widgetId = `html_${timestamp}`;
  
  // Elementor requires specific structure - ensure all required fields are present
  return [
    {
      id: sectionId,
      elType: 'section',
      isInner: false,
      settings: {
        // Full width content - Elementor Content Width dropdown setting
        // Elementor may use different formats, trying the most common ones
        content_width: 'fullwidth', // Most common format (no underscore, lowercase)
        // Also try setting layout property to ensure full width
        layout: 'full_width', // Alternative layout setting
        // Zero padding and margin for section
        padding: {
          unit: 'px',
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
          isLinked: false
        },
        margin: {
          unit: 'px',
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
          isLinked: false
        }
        // Note: Not setting stretch_section - leaving it as default
      },
      elements: [
        {
          id: columnId,
          elType: 'column',
          isInner: false,
          settings: {
            // Column width 100%
            width: '100',
            // Zero padding and margin for column
            padding: {
              unit: 'px',
              top: '0',
              right: '0',
              bottom: '0',
              left: '0',
              isLinked: false
            },
            margin: {
              unit: 'px',
              top: '0',
              right: '0',
              bottom: '0',
              left: '0',
              isLinked: false
            }
          },
          elements: [
            {
              id: widgetId,
              elType: 'widget',
              widgetType: 'html',
              settings: {
                html: htmlContent
                // Note: HTML widget may not support padding/margin in settings
              },
              elements: []
            }
          ]
        }
      ]
    }
  ];
};

const createPage = async (title, content, status = 'draft', featuredMediaId = null, seoMetadata = null, connectionId = null) => {
  const credentials = await getConnectionCredentials(connectionId);
  const auth = createAuthHeader(credentials.username, credentials.appPassword);
  const contentMethod = credentials.contentMethod || 'html_block';
  let pageContent = content;

  // Convert content based on method
  if (contentMethod === 'html_block') {
    // Use Gutenberg HTML block format (comment-based)
    // WordPress Block Editor recognizes this format
    pageContent = `<!-- wp:html -->\n${content}\n<!-- /wp:html -->`;
  } else if (contentMethod === 'elementor') {
    // For Elementor, we'll create page first, then add Elementor data
    pageContent = ''; // Empty content, Elementor data added separately
  }
  // If 'direct', use content as-is

  const pageData = {
    title,
    content: pageContent,
    status: status || 'draft'
  };

  if (featuredMediaId) {
    pageData.featured_media = featuredMediaId;
  }

  // Add Yoast SEO metadata if provided
  if (seoMetadata) {
    pageData.meta = pageData.meta || {};
    pageData.meta._yoast_wpseo_title = seoMetadata.metaTitle || '';
    pageData.meta._yoast_wpseo_metadesc = seoMetadata.metaDescription || '';
    pageData.meta._yoast_wpseo_focuskw = seoMetadata.focusKeyphrase || '';

    console.log('[WordPress API] Sending Yoast SEO metadata:', {
      title: seoMetadata.metaTitle,
      description: seoMetadata.metaDescription,
      focusKeyphrase: seoMetadata.focusKeyphrase
    });
  }

  try {
    console.log('[WordPress API] Page data being sent:', JSON.stringify(pageData, null, 2));
    const response = await axios.post(`${credentials.siteUrl}/wp-json/wp/v2/pages`, pageData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[WordPress API] Response meta fields:', response.data.meta);

    const pageId = response.data.id;

    // If using Elementor, add Elementor data via post meta
    if (contentMethod === 'elementor') {
      try {
        // Elementor stores data in post meta _elementor_data
        const elementorData = htmlToElementorFormat(content);
        
        // Validate Elementor data structure
        if (!Array.isArray(elementorData) || elementorData.length === 0) {
          throw new Error('Invalid Elementor data structure');
        }
        
        // Elementor page settings - controls page layout
        const elementorPageSettings = {
          page_layout: 'elementor_full_width'
        };
        
        // First, set Elementor data and basic settings
        const elementorPayload = {
          meta: {
            _elementor_data: JSON.stringify(elementorData),
            _elementor_edit_mode: 'builder',
            _elementor_template_type: 'wp-page',
            _elementor_version: '3.0.0',
            _elementor_pro_version: '',
            _wp_page_template: 'elementor_full_width'
          }
        };
        
        // Update with Elementor data
        await axios.post(
          `${credentials.siteUrl}/wp-json/wp/v2/pages/${pageId}`,
          elementorPayload,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Then set page settings separately (Elementor may need this in separate call)
        const pageSettingsUpdate = {
          meta: {
            _elementor_page_settings: JSON.stringify(elementorPageSettings)
          }
        };
        
        await axios.post(
          `${credentials.siteUrl}/wp-json/wp/v2/pages/${pageId}`,
          pageSettingsUpdate,
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (elementorError) {
        console.warn('Elementor integration failed, using HTML block fallback:', elementorError.message);
        // Fallback: use HTML block format
        const fallbackContent = `<!-- wp:html -->\n${content}\n<!-- /wp:html -->`;
        await axios.post(
          `${credentials.siteUrl}/wp-json/wp/v2/pages/${pageId}`,
          { content: fallbackContent },
          {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          }
        );
      }
    }

    // After page creation, attempt to set Yoast SEO metadata
    if (seoMetadata) {
      await setYoastSEO(credentials.siteUrl, pageId, seoMetadata, auth);
    }

    return {
      id: pageId,
      url: response.data.link,
      status: response.data.status
    };
  } catch (error) {
    throw new Error(`Page creation failed: ${error.message}`);
  }
};

const updatePage = async (pageId, title, content, status = null, seoMetadata = null, connectionId = null) => {
  const credentials = await getConnectionCredentials(connectionId);
  const auth = createAuthHeader(credentials.username, credentials.appPassword);
  const contentMethod = credentials.contentMethod || 'html_block';
  let pageContent = content;

  // Convert content based on method
  if (contentMethod === 'html_block') {
    pageContent = `<!-- wp:html -->\n${content}\n<!-- /wp:html -->`;
  } else if (contentMethod === 'elementor') {
    // For Elementor updates, update Elementor data via post meta
    try {
      const elementorData = htmlToElementorFormat(content);
      
      // Validate Elementor data structure
      if (!Array.isArray(elementorData) || elementorData.length === 0) {
        throw new Error('Invalid Elementor data structure');
      }
      
      // Elementor page settings - controls page layout
      const elementorPageSettings = {
        page_layout: 'elementor_full_width'
      };
      
      // First, set Elementor data and basic settings
      const elementorPayload = {
        meta: {
          _elementor_data: JSON.stringify(elementorData),
          _elementor_edit_mode: 'builder',
          _elementor_version: '3.0.0',
          _wp_page_template: 'elementor_full_width'
        }
      };
      
      // Update with Elementor data
      await axios.post(
        `${credentials.siteUrl}/wp-json/wp/v2/pages/${pageId}`,
        elementorPayload,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Then set page settings separately
      const pageSettingsUpdate = {
        meta: {
          _elementor_page_settings: JSON.stringify(elementorPageSettings)
        }
      };
      
      await axios.post(
        `${credentials.siteUrl}/wp-json/wp/v2/pages/${pageId}`,
        pageSettingsUpdate,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // Elementor handles content separately, so we can return early
      return {
        id: pageId,
        url: `${siteUrl}/?p=${pageId}`,
        status: status || 'draft'
      };
    } catch (elementorError) {
      console.warn('Elementor update failed, using HTML block fallback:', elementorError.message);
      pageContent = `<!-- wp:html -->\n${content}\n<!-- /wp:html -->`;
    }
  }

  const pageData = { title, content: pageContent };
  if (status) {
    pageData.status = status;
  }

  // Add Yoast SEO metadata if provided
  if (seoMetadata) {
    pageData.meta = pageData.meta || {};
    pageData.meta._yoast_wpseo_title = seoMetadata.metaTitle || '';
    pageData.meta._yoast_wpseo_metadesc = seoMetadata.metaDescription || '';
    pageData.meta._yoast_wpseo_focuskw = seoMetadata.focusKeyphrase || '';

    console.log('[WordPress API] Updating Yoast SEO metadata:', {
      title: seoMetadata.metaTitle,
      description: seoMetadata.metaDescription,
      focusKeyphrase: seoMetadata.focusKeyphrase
    });
  }

  try {
    console.log('[WordPress API] Update page data:', JSON.stringify(pageData, null, 2));
    const response = await axios.post(`${credentials.siteUrl}/wp-json/wp/v2/pages/${pageId}`, pageData, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[WordPress API] Update response meta fields:', response.data.meta);

    // After page update, attempt to set Yoast SEO metadata
    if (seoMetadata) {
      await setYoastSEO(credentials.siteUrl, pageId, seoMetadata, auth);
    }

    return {
      id: response.data.id,
      url: response.data.link,
      status: response.data.status
    };
  } catch (error) {
    throw new Error(`Page update failed: ${error.message}`);
  }
};

module.exports = {
  testConnection,
  testConnectionWithCredentials,
  getConnectionCredentials,
  uploadImage,
  deleteMedia,
  createPage,
  updatePage,
  setYoastSEO,
  htmlToBlockFormat,
  htmlToElementorFormat
};


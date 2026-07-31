const express = require('express');
const router = express.Router();
const multer = require('multer');
const Image = require('../models/Image');
const Page = require('../models/Page');
const { uploadImage, deleteMedia } = require('../services/wordpressService');
const { analyzeImage } = require('../services/openaiService');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Get all images
router.get('/', async (req, res) => {
  try {
    const { category, tags, search } = req.query;
    const query = {};

    if (category) query.category = category;
    if (tags) query.tags = { $in: tags.split(',') };
    if (search) {
      query.$or = [
        { filename: { $regex: search, $options: 'i' } },
        { altText: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    const images = await Image.find(query).sort({ uploadedAt: -1 });
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single image
router.get('/:id', async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.json(image);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload image
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { altText, tags, category, wordpressConnectionId, uploadToWordPress, useAI } = req.body;
    let filename = req.file.originalname;
    let generatedMetadata = null;

    // Analyze image with OpenAI if requested and uploading to WordPress
    if (uploadToWordPress === 'true' && wordpressConnectionId && useAI === 'true') {
      try {
        console.log('Analyzing image with OpenAI...');
        generatedMetadata = await analyzeImage(req.file.buffer, filename);
        
        // Use generated filename if available
        if (generatedMetadata.filename) {
          filename = generatedMetadata.filename;
        }
        
        console.log('Generated metadata:', {
          filename: generatedMetadata.filename,
          title: generatedMetadata.title,
          altText: generatedMetadata.altText?.substring(0, 50) + '...'
        });
      } catch (aiError) {
        console.error('AI analysis failed, using original filename:', aiError.message);
        // Continue with original filename if AI analysis fails
      }
    }

    // Use generated metadata or provided values
    const finalAltText = altText || generatedMetadata?.altText || '';
    const finalTitle = generatedMetadata?.title || '';
    const finalCaption = generatedMetadata?.caption || '';
    const finalDescription = generatedMetadata?.description || '';

    // Save to database first (local storage)
    const image = new Image({
      filename,
      url: `/uploads/${filename}`, // Local URL - you may need to implement file storage
      altText: finalAltText,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      category: category || 'general',
      description: finalDescription,
      fileSize: req.file.size,
      wordpressUploads: []
    });

    // Upload to WordPress if requested
    if (uploadToWordPress === 'true' && wordpressConnectionId) {
      try {
        const metadata = {
          altText: finalAltText,
          title: finalTitle,
          caption: finalCaption,
          description: finalDescription
        };

        const wordpressResult = await uploadImage(
          req.file.buffer,
          filename,
          finalAltText,
          wordpressConnectionId,
          metadata
        );

        // Add WordPress upload info
        image.wordpressUploads.push({
          connectionId: wordpressConnectionId,
          mediaId: wordpressResult.id,
          url: wordpressResult.url,
          uploadedAt: new Date()
        });

        // Keep legacy field for backward compatibility
        image.wordpressMediaId = wordpressResult.id;
        image.url = wordpressResult.url; // Use WordPress URL as primary
        image.width = wordpressResult.mediaDetails?.width;
        image.height = wordpressResult.mediaDetails?.height;
      } catch (wpError) {
        console.error('WordPress upload failed:', wpError);
        // Continue with local save even if WordPress upload fails
      }
    }

    await image.save();
    
    // Include generated metadata in response if available
    const response = image.toObject();
    if (generatedMetadata) {
      response.generatedMetadata = {
        filename: generatedMetadata.filename,
        title: generatedMetadata.title,
        altText: generatedMetadata.altText,
        caption: generatedMetadata.caption,
        description: generatedMetadata.description
      };
    }
    
    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk upload
router.post('/bulk-upload', upload.array('images', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    const { wordpressConnectionId, uploadToWordPress } = req.body;
    const uploadedImages = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const image = new Image({
          filename: file.originalname,
          url: `/uploads/${file.originalname}`, // Local URL
          altText: '',
          tags: [],
          category: 'general',
          fileSize: file.size,
          wordpressUploads: []
        });

        // Upload to WordPress if requested
        if (uploadToWordPress === 'true' && wordpressConnectionId) {
          try {
            let uploadFilename = file.originalname;
            let uploadMetadata = {};

            // Analyze image with OpenAI if useAI is enabled
            const useAI = req.body.useAI === 'true';
            if (useAI) {
              try {
                const generatedMetadata = await analyzeImage(file.buffer, file.originalname);
                if (generatedMetadata.filename) {
                  uploadFilename = generatedMetadata.filename;
                }
                uploadMetadata = {
                  altText: generatedMetadata.altText || '',
                  title: generatedMetadata.title || '',
                  caption: generatedMetadata.caption || '',
                  description: generatedMetadata.description || ''
                };
              } catch (aiError) {
                console.error('AI analysis failed for', file.originalname, ':', aiError.message);
              }
            }

            const wordpressResult = await uploadImage(
              file.buffer,
              uploadFilename,
              uploadMetadata.altText || '',
              wordpressConnectionId,
              uploadMetadata
            );

            image.wordpressUploads.push({
              connectionId: wordpressConnectionId,
              mediaId: wordpressResult.id,
              url: wordpressResult.url,
              uploadedAt: new Date()
            });

            image.filename = uploadFilename;
            image.altText = uploadMetadata.altText || image.altText;
            image.description = uploadMetadata.description || image.description;
            image.wordpressMediaId = wordpressResult.id;
            image.url = wordpressResult.url;
            image.width = wordpressResult.mediaDetails?.width;
            image.height = wordpressResult.mediaDetails?.height;
          } catch (wpError) {
            console.error('WordPress upload failed for', file.originalname, ':', wpError);
            // Continue with local save
          }
        }

        await image.save();
        uploadedImages.push(image);
      } catch (error) {
        errors.push({ filename: file.originalname, error: error.message });
      }
    }

    res.json({ uploaded: uploadedImages, errors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update image metadata
router.put('/:id', async (req, res) => {
  try {
    const { altText, tags, category, description } = req.body;

    const image = await Image.findById(req.params.id);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    if (altText !== undefined) image.altText = altText;
    if (tags) image.tags = tags;
    if (category) image.category = category;
    if (description !== undefined) image.description = description;

    await image.save();
    res.json(image);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete image
router.delete('/:id', async (req, res) => {
  try {
    const { deleteFromWordPress } = req.query; // Optional: ?deleteFromWordPress=true
    const image = await Image.findById(req.params.id);
    
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Check if image is used in any pages
    const pagesUsingImage = await Page.countDocuments({
      'images.imageId': image._id
    });

    const deletionResults = {
      local: false,
      wordpress: {
        attempted: false,
        success: [],
        failed: []
      },
      warnings: []
    };

    // Delete from WordPress if requested and image has WordPress uploads
    if (deleteFromWordPress === 'true' && image.wordpressUploads && image.wordpressUploads.length > 0) {
      deletionResults.wordpress.attempted = true;
      
      for (const upload of image.wordpressUploads) {
        try {
          await deleteMedia(upload.mediaId, upload.connectionId);
          deletionResults.wordpress.success.push({
            connectionId: upload.connectionId.toString(),
            mediaId: upload.mediaId
          });
        } catch (error) {
          deletionResults.wordpress.failed.push({
            connectionId: upload.connectionId.toString(),
            mediaId: upload.mediaId,
            error: error.message
          });
        }
      }
    } else if (image.wordpressUploads && image.wordpressUploads.length > 0) {
      // Warn if image exists in WordPress but deletion wasn't requested
      deletionResults.warnings.push(
        `Image exists in ${image.wordpressUploads.length} WordPress connection(s) but was not deleted from WordPress. Use ?deleteFromWordPress=true to delete from WordPress as well.`
      );
    }

    // Add warning if image is used in pages
    if (pagesUsingImage > 0) {
      deletionResults.warnings.push(
        `Image is used in ${pagesUsingImage} page(s). Deleting may break those pages.`
      );
    }

    // Delete from local database
    await Image.findByIdAndDelete(req.params.id);
    deletionResults.local = true;

    // Return detailed results
    res.json({
      message: 'Image deleted successfully',
      details: deletionResults
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;


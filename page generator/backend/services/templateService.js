/**
 * Extract placeholders from HTML template
 */
const extractPlaceholders = (htmlContent) => {
  const placeholderRegex = /\{\{([A-Z_]+)\}\}/g;
  const placeholders = new Set();
  let match;

  while ((match = placeholderRegex.exec(htmlContent)) !== null) {
    placeholders.add(match[1]);
  }

  return Array.from(placeholders).map(name => {
    let type = 'content';
    let wordLimit = null;

    if (name.includes('KEYWORD')) {
      type = 'keyword';
    } else if (name.includes('IMAGE')) {
      type = 'image';
    } else if (name.includes('PARAGRAPH') || name.includes('CONTENT')) {
      wordLimit = 150;
    } else if (name.includes('INTRO')) {
      wordLimit = 150;
    }

    return {
      name,
      type,
      wordLimit,
      required: true
    };
  });
};

/**
 * Extract image slots from HTML template
 */
const extractImageSlots = (htmlContent) => {
  const imageRegex = /<img[^>]*src=["']\{\{([A-Z_]+)\}\}["'][^>]*>/gi;
  const slots = [];
  let match;
  let position = 1;

  while ((match = imageRegex.exec(htmlContent)) !== null) {
    const urlPlaceholder = match[1];
    const altPlaceholder = urlPlaceholder.replace('_URL', '_ALT') || `${urlPlaceholder}_ALT`;

    slots.push({
      position: position++,
      urlPlaceholder,
      altPlaceholder
    });
  }

  return slots;
};

/**
 * Fill template with content
 */
const fillTemplate = (htmlContent, contentData, images) => {
  let filledHtml = htmlContent;

  // Replace keyword placeholders (case-insensitive)
  filledHtml = filledHtml.replace(/\{\{MAIN_KEYWORD\}\}/gi, contentData.mainKeyword || '');
  filledHtml = filledHtml.replace(/\{\{FOCUS_KEYWORD\}\}/gi, contentData.focusKeyword || '');
  
  // Log initial placeholders found
  const initialPlaceholders = htmlContent.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/gi);
  if (initialPlaceholders) {
    console.log('[Template Fill] Initial placeholders in template:', [...new Set(initialPlaceholders)]);
  }

  // Replace content placeholders
  if (contentData.generatedContent) {
    const gc = contentData.generatedContent;

    // Intro section
    if (gc.intro) {
      filledHtml = filledHtml.replace(/\{\{INTRO_H1\}\}/gi, gc.intro.h1 || '');
      filledHtml = filledHtml.replace(/\{\{INTRO_PARAGRAPH_1\}\}/gi, gc.intro.paragraph1 || '');
      filledHtml = filledHtml.replace(/\{\{INTRO_PARAGRAPH_2\}\}/gi, gc.intro.paragraph2 || '');
      
      // Also try to find and replace any paragraph placeholders in intro section
      const introParagraphs = [gc.intro.paragraph1, gc.intro.paragraph2].filter(p => p);
      introParagraphs.forEach((para, idx) => {
        filledHtml = filledHtml.replace(
          new RegExp(`\\{\\{INTRO_PARAGRAPH[^}]*\\}\\}`, 'gi'),
          (match, offset) => {
            // Only replace if not already replaced
            if (filledHtml.substring(offset, offset + match.length) === match) {
              return idx < introParagraphs.length ? introParagraphs[idx] : match;
            }
            return match;
          }
        );
      });
    }

    // Value section
    if (gc.value) {
      filledHtml = filledHtml.replace(/\{\{VALUE_PARAGRAPH\}\}/gi, gc.value.paragraph || '');
      if (gc.value.features) {
        gc.value.features.forEach((feature, index) => {
          // Map VALUE_FEATURES to FEATURE placeholders
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{FEATURE_${index + 1}\\}\\}`, 'gi'),
            feature
          );
        });
      }
    }

    // Why section
    if (gc.why) {
      filledHtml = filledHtml.replace(/\{\{WHY_HEADING\}\}/gi, gc.why.heading || '');
      if (gc.why.cards) {
        gc.why.cards.forEach((card, index) => {
          // Map WHY_CARDS to WHY_CARD placeholders
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{WHY_CARD_${index + 1}_TITLE\\}\\}`, 'gi'),
            card.title || ''
          );
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{WHY_CARD_${index + 1}_DESC\\}\\}`, 'gi'),
            card.desc || ''
          );
        });
      }
      filledHtml = filledHtml.replace(/\{\{WHY_FOOTNOTE\}\}/gi, gc.why.footnote || '');
    }

    // Features section
    if (gc.features) {
      filledHtml = filledHtml.replace(/\{\{FEATURES_HEADING\}\}/gi, gc.features.heading || '');
      if (gc.features.boxes) {
        gc.features.boxes.forEach((box, index) => {
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{FEATURE_BOX_${index + 1}_TITLE\\}\\}`, 'gi'),
            box.title || ''
          );
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{FEATURE_BOX_${index + 1}_INTRO\\}\\}`, 'gi'),
            box.intro || ''
          );
          if (box.list) {
            box.list.forEach((item, itemIndex) => {
              filledHtml = filledHtml.replace(
                new RegExp(`\\{\\{FEATURE_BOX_${index + 1}_LIST_${itemIndex + 1}\\}\\}`, 'gi'),
                item
              );
            });
          }
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{FEATURE_BOX_${index + 1}_RESULT\\}\\}`, 'gi'),
            box.result || ''
          );
        });
      }
    }

    // Industries section
    if (gc.industries) {
      filledHtml = filledHtml.replace(/\{\{INDUSTRIES_HEADING\}\}/gi, gc.industries.heading || '');
      filledHtml = filledHtml.replace(/\{\{INDUSTRIES_INTRO\}\}/gi, gc.industries.intro || '');
      if (gc.industries.categories) {
        gc.industries.categories.forEach((category, index) => {
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{CATEGORY_${index + 1}\\}\\}`, 'gi'),
            category
          );
        });
      }
    }

    // Benefits section
    if (gc.benefits) {
      filledHtml = filledHtml.replace(/\{\{BENEFITS_HEADING\}\}/gi, gc.benefits.heading || '');
      if (gc.benefits.cards) {
        gc.benefits.cards.forEach((card, index) => {
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{BENEFIT_${index + 1}_TITLE\\}\\}`, 'gi'),
            card.title || ''
          );
          filledHtml = filledHtml.replace(
            new RegExp(`\\{\\{BENEFIT_${index + 1}_DESC\\}\\}`, 'gi'),
            card.desc || ''
          );
        });
      }
      filledHtml = filledHtml.replace(/\{\{BENEFITS_FOOTNOTE\}\}/gi, gc.benefits.footnote || '');
    }

    // CTA section
    if (gc.cta) {
      filledHtml = filledHtml.replace(/\{\{CTA_HEADING\}\}/gi, gc.cta.heading || '');
      filledHtml = filledHtml.replace(/\{\{CTA_PARAGRAPH_1\}\}/gi, gc.cta.paragraph1 || '');
      filledHtml = filledHtml.replace(/\{\{CTA_PARAGRAPH_2\}\}/gi, gc.cta.paragraph2 || '');
    }
    
    // Generic placeholder replacement - find any remaining placeholders and try to map them
    const allPlaceholders = filledHtml.match(/\{\{([A-Z_][A-Z0-9_]*)\}\}/gi);
    if (allPlaceholders) {
      const uniquePlaceholders = [...new Set(allPlaceholders)];
      console.log('[Template Fill] Found placeholders in template:', uniquePlaceholders);
      
      // Create a flat mapping of all content
      const contentMap = {};
      
      // Flatten the generated content structure with better key normalization
      const flattenContent = (obj, prefix = '') => {
        for (const key in obj) {
          const newKey = prefix ? `${prefix}_${key.toUpperCase()}` : key.toUpperCase();
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            flattenContent(obj[key], newKey);
          } else if (Array.isArray(obj[key])) {
            obj[key].forEach((item, index) => {
              if (typeof item === 'object') {
                flattenContent(item, `${newKey}_${index + 1}`);
              } else {
                // Store with both formats: with and without underscore before number
                const keyWithUnderscore = `${newKey}_${index + 1}`;
                const keyWithoutUnderscore = `${newKey}${index + 1}`;
                contentMap[keyWithUnderscore] = item;
                contentMap[keyWithoutUnderscore] = item;
                
                // Also map VALUE_FEATURES to FEATURE for template compatibility
                if (newKey === 'VALUE_FEATURES') {
                  contentMap[`FEATURE_${index + 1}`] = item;
                }
              }
            });
          } else {
            contentMap[newKey] = obj[key];
            // Also create version with normalized underscores for numbers
            const normalizedKey = newKey.replace(/(\d+)/g, '_$1');
            if (normalizedKey !== newKey) {
              contentMap[normalizedKey] = obj[key];
            }
          }
        }
      };
      
      // Also add specific mappings for common mismatches
      if (gc.value && gc.value.features) {
        gc.value.features.forEach((feature, index) => {
          contentMap[`FEATURE_${index + 1}`] = feature;
        });
      }
      
      if (gc.why && gc.why.cards) {
        gc.why.cards.forEach((card, index) => {
          contentMap[`WHY_CARD_${index + 1}_TITLE`] = card.title || '';
          contentMap[`WHY_CARD_${index + 1}_DESC`] = card.desc || '';
        });
      }
      
      flattenContent(gc);
      console.log('[Template Fill] Content map keys:', Object.keys(contentMap).slice(0, 20));
      
      // Try to match placeholders with content - improved matching
      uniquePlaceholders.forEach(placeholder => {
        const placeholderName = placeholder.replace(/\{\{|\}\}/g, '').toUpperCase();
        
        // Try exact match
        if (contentMap[placeholderName]) {
          filledHtml = filledHtml.replace(
            new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'),
            contentMap[placeholderName]
          );
          return;
        }
        
        // Try normalized match (handle underscore differences)
        const normalizedPlaceholder = placeholderName.replace(/(\d+)/g, '_$1');
        if (contentMap[normalizedPlaceholder]) {
          filledHtml = filledHtml.replace(
            new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'),
            contentMap[normalizedPlaceholder]
          );
          return;
        }
        
        // Try reverse normalization (remove underscore before number)
        const reverseNormalized = placeholderName.replace(/_(\d+)/g, '$1');
        if (contentMap[reverseNormalized]) {
          filledHtml = filledHtml.replace(
            new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'),
            contentMap[reverseNormalized]
          );
          return;
        }
        
        // Try partial/fuzzy matches
        const matchingKey = Object.keys(contentMap).find(key => {
          // Remove underscores and numbers for comparison
          const keyBase = key.replace(/[_\d]/g, '').toUpperCase();
          const placeholderBase = placeholderName.replace(/[_\d]/g, '').toUpperCase();
          return keyBase === placeholderBase || 
                 key.includes(placeholderName) || 
                 placeholderName.includes(key);
        });
        
        if (matchingKey) {
          filledHtml = filledHtml.replace(
            new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'gi'),
            contentMap[matchingKey]
          );
        }
      });
    }
  }

  // Replace image placeholders - more flexible matching
  if (images && images.length > 0) {
    images.forEach((image, index) => {
      const num = index + 1;
      
      // Try various placeholder formats
      const urlPatterns = [
        `IMAGE_${num}_URL`,
        `IMAGE${num}_URL`,
        `IMAGE_${num}`,
        `IMAGE${num}`
      ];
      
      const altPatterns = [
        `IMAGE_${num}_ALT`,
        `IMAGE${num}_ALT`,
        `IMAGE_${num}_ALT_TEXT`,
        `IMAGE${num}_ALT_TEXT`
      ];
      
      urlPatterns.forEach(pattern => {
        filledHtml = filledHtml.replace(
          new RegExp(`\\{\\{${pattern}\\}\\}`, 'gi'),
          image.url
        );
      });
      
      altPatterns.forEach(pattern => {
        filledHtml = filledHtml.replace(
          new RegExp(`\\{\\{${pattern}\\}\\}`, 'gi'),
          image.alt
        );
      });
      
      // Also replace in img src attributes directly
      filledHtml = filledHtml.replace(
        new RegExp(`(<img[^>]*src=["'])\\{\\{IMAGE[^}]*${num}[^}]*\\}\\}(["'][^>]*>)`, 'gi'),
        `$1${image.url}$2`
      );
      
      // Replace alt attributes
      filledHtml = filledHtml.replace(
        new RegExp(`(<img[^>]*alt=["'])\\{\\{IMAGE[^}]*${num}[^}]*ALT[^}]*\\}\\}(["'][^>]*>)`, 'gi'),
        `$1${image.alt}$2`
      );
    });
  }
  
  // Log any remaining placeholders for debugging
  const remainingPlaceholders = filledHtml.match(/\{\{[A-Z_][A-Z0-9_]*\}\}/gi);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    console.log('[Template Fill] Remaining placeholders:', [...new Set(remainingPlaceholders)]);
  }

  return filledHtml;
};

/**
 * Count words in HTML content
 */
const countWords = (htmlContent) => {
  const text = htmlContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.split(' ').filter(word => word.length > 0).length;
};

module.exports = {
  extractPlaceholders,
  extractImageSlots,
  fillTemplate,
  countWords
};


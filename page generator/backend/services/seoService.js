/**
 * SEO Generation Service
 * Generates Yoast-optimized SEO metadata (title, description, keyphrase)
 */

const generateSeoMetadata = (mainKeyword, focusKeyword, pageTitle, titleConnector = 'for') => {
  // Generate SEO Title (50-55 characters with all 3 components)
  const seoTitle = generateSeoTitle(mainKeyword, focusKeyword, titleConnector);

  // Generate Meta Description (160 characters)
  const metaDescription = generateMetaDescription(mainKeyword, focusKeyword);

  // Focus Keyphrase (use the page title format)
  const focusKeyphrase = pageTitle || `${mainKeyword} ${titleConnector} ${focusKeyword}`;

  return {
    metaTitle: seoTitle,
    metaDescription: metaDescription,
    focusKeyphrase: focusKeyphrase
  };
};

const generateSeoTitle = (mainKeyword, focusKeyword, titleConnector = 'for') => {
  // Format: "[Main Keyword] [Connector] [Focus Keyword] | [Power Word] [Benefit]"
  // REQUIREMENT: COMPULSORY 50-55 characters, MUST include all 3 components

  const powerBenefitPairs = [
    { power: 'Best', benefit: 'Solutions & Tools' },
    { power: 'Top', benefit: 'Guide & Tips' },
    { power: 'Complete', benefit: 'Resource' },
    { power: 'Proven', benefit: 'Strategies' },
    { power: 'Expert', benefit: 'Insights' },
    { power: 'Ultimate', benefit: 'Services' },
    { power: 'Boost', benefit: 'Revenue' },
    { power: 'Maximize', benefit: 'Success' },
    { power: 'Smart', benefit: 'Solutions' },
    { power: 'Leading', benefit: 'Provider' },
    { power: 'Professional', benefit: 'Services' },
    { power: 'Comprehensive', benefit: 'Guide' },
  ];

  // Shuffle to get random selection
  const selectedPair = powerBenefitPairs[Math.floor(Math.random() * powerBenefitPairs.length)];

  // Try different combinations to reach 50-55 characters

  // Option 1: "[Power] [Main] [Connector] [Focus] | [Benefit]"
  let title = `${selectedPair.power} ${mainKeyword} ${titleConnector} ${focusKeyword} | ${selectedPair.benefit}`;
  if (title.length >= 50 && title.length <= 55) {
    return title;
  }

  // Option 2: "[Main] [Connector] [Focus] | [Power] [Benefit]"
  title = `${mainKeyword} ${titleConnector} ${focusKeyword} | ${selectedPair.power} ${selectedPair.benefit}`;
  if (title.length >= 50 && title.length <= 55) {
    return title;
  }

  // Option 3: "[Power] [Main] [Connector] [Focus]"
  title = `${selectedPair.power} ${mainKeyword} ${titleConnector} ${focusKeyword}`;
  if (title.length >= 50 && title.length <= 55) {
    return title;
  }

  // Option 4: Try longer power word variations
  const longPowerWords = [
    'Best Professional',
    'Top Rated',
    'Complete & Expert',
    'Proven & Trusted',
    'Leading Expert',
    'Ultimate Professional',
  ];

  for (let powerPhrase of longPowerWords) {
    title = `${powerPhrase} ${mainKeyword} ${titleConnector} ${focusKeyword}`;
    if (title.length >= 50 && title.length <= 55) {
      return title;
    }
  }

  // Option 5: If still not in range, pad appropriately
  title = `${mainKeyword} ${titleConnector} ${focusKeyword}`;

  if (title.length < 50) {
    // Pad with descriptive text
    const padding = `Best & Top Professional Services`;
    title = `${selectedPair.power} ${mainKeyword} ${titleConnector} ${focusKeyword}`;

    // If still under 50, add more description
    if (title.length < 50) {
      title = `Best Professional ${mainKeyword} ${titleConnector} ${focusKeyword}`;
    }
  }

  // If exceeds 55, trim intelligently
  if (title.length > 55) {
    // Try removing the benefit part
    title = `${selectedPair.power} ${mainKeyword} ${titleConnector} ${focusKeyword}`;

    // If still too long, shorten smartly
    if (title.length > 55) {
      title = title.substring(0, 52).trim() + '...';
    }
  }

  // Final validation: ensure minimum 50 characters
  if (title.length < 50) {
    title = `Professional ${mainKeyword} ${titleConnector} ${focusKeyword} - Best`;
  }

  return title;
};

const generateMetaDescription = (mainKeyword, focusKeyword) => {
  const templates = [
    `Discover how ${mainKeyword} transform ${focusKeyword} operations. Learn key benefits, implementation strategies, and best practices. Get expert insights and solutions.`,
    `Explore ${mainKeyword} for ${focusKeyword}. Understand advantages, ROI potential, and industry applications. Complete guide for businesses seeking competitive edge.`,
    `Learn about ${mainKeyword} in ${focusKeyword} sector. Expert analysis of benefits, challenges, and optimization strategies. Start your journey to digital transformation.`,
    `${mainKeyword} solutions for ${focusKeyword}: improve efficiency, reduce costs, and enhance productivity. Comprehensive guide with actionable insights and real-world examples.`,
    `Maximize ${focusKeyword} success with ${mainKeyword}. Discover automation benefits, integration methods, and measurable results. Industry-specific strategies included.`,
  ];

  // Select a random template
  let description = templates[Math.floor(Math.random() * templates.length)];

  // Ensure it's under 160 characters
  if (description.length > 160) {
    description = description.substring(0, 157) + '...';
  }

  return description;
};

module.exports = {
  generateSeoMetadata,
  generateSeoTitle,
  generateMetaDescription
};


'use server';
/**
 * @fileOverview AI Tool for fetching basic product information from an Amazon product link.
 *
 * - fetchAmazonProductInfoTool - An AI tool that attempts to extract product name, description, and image URL
 *   by fetching and parsing the Amazon product page.
 * - FetchAmazonProductInfoInput - Input schema for the tool (Amazon product URL).
 * - FetchAmazonProductInfoOutput - Output schema for the tool (product name, description, image URL).
 *
 * IMPORTANT: This tool performs live web scraping of Amazon product pages. This can be unreliable due
 * to frequent site structure changes and anti-scraping measures. For production, a dedicated API
 * (e.g., Amazon Product Advertising API) or a robust third-party scraping service is recommended.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import * as cheerio from 'cheerio';

const FetchAmazonProductInfoInputSchema = z.object({
  productURL: z
    .string()
    .url()
    .describe('The full URL of the Amazon product page.'),
});
export type FetchAmazonProductInfoInput = z.infer<typeof FetchAmazonProductInfoInputSchema>;

const FetchAmazonProductInfoOutputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productDescription: z
    .string()
    .describe('A brief description or key features of the product.'),
  productImageURL: z.string().url().optional().describe('A URL for the product image, if found.'),
});
export type FetchAmazonProductInfoOutput = z.infer<typeof FetchAmazonProductInfoOutputSchema>;

const DEFAULT_PRODUCT_NAME = 'Product (Details not fully fetched)';
const DEFAULT_DESCRIPTION = 'Could not fetch detailed product description. Please refer to the Amazon page.';
const PLACEHOLDER_IMAGE_BASE = 'https://placehold.co/300x200.png?text=';

async function fetchPage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        // Using a common browser user-agent might help bypass some basic blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        // Add other headers if necessary, e.g., 'Accept-Encoding': 'gzip, deflate, br'
      },
      // Next.js fetch specific caching options can be managed here if needed
      // cache: 'no-store', // Uncomment to ensure fresh data, but be mindful of rate limits
    });
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return null;
  }
}

export const fetchAmazonProductInfoTool = ai.defineTool(
  {
    name: 'fetchAmazonProductInfoTool',
    description:
      'Fetches basic product information (name, description, image URL) by scraping a given Amazon product page URL. This is a best-effort attempt and may not always succeed.',
    inputSchema: FetchAmazonProductInfoInputSchema,
    outputSchema: FetchAmazonProductInfoOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonProductInfoOutput> => {
    let productName = DEFAULT_PRODUCT_NAME;
    let productDescription = DEFAULT_DESCRIPTION;
    let productImageURL: string | undefined = `${PLACEHOLDER_IMAGE_BASE}Product`;

    try {
      const html = await fetchPage(productURL);
      if (!html) {
        throw new Error('Failed to fetch page content.');
      }

      const $ = cheerio.load(html);

      // 1. Extract Product Title
      const titleElement = $('#productTitle');
      if (titleElement.length > 0) {
        productName = titleElement.text().trim();
      } else {
         // Fallback: try to get from meta title
        const metaTitle = $('head > title').text().trim();
        if (metaTitle) {
            // Often Amazon titles are like "Amazon.com: Actual Product Title"
            const parts = metaTitle.split(':');
            if (parts.length > 1) {
                productName = parts.slice(1).join(':').trim();
            } else {
                productName = metaTitle;
            }
        }
      }
      // Clean up product name further if it's still the default or very generic
      if (productName === DEFAULT_PRODUCT_NAME || productName.toLowerCase().startsWith("amazon.com")) {
         // Try to parse from URL as a last resort if title scraping failed
        try {
            const urlObj = new URL(productURL);
            const pathParts = urlObj.pathname.split('/');
            const dpIndex = pathParts.findIndex(part => part === 'dp');
            if (dpIndex > 0 && pathParts[dpIndex -1] && pathParts[dpIndex -1].length > 5) {
                const potentialName = decodeURIComponent(pathParts[dpIndex - 1].replace(/-/g, ' '));
                 productName = potentialName.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');
            }
        } catch (e) { /* ignore URL parsing error for name */ }
      }


      // 2. Extract Product Image URL
      // Common selectors for main product image. Order matters.
      const imageSelectors = [
        '#landingImage', // Primary image
        '#imgBlkFront', // Another common ID
        '#ebooksImgBlkFront', // For Kindle ebooks
        '#main-image-container img',
        '#imgTagWrapperId img',
      ];
      for (const selector of imageSelectors) {
        const imgElement = $(selector);
        if (imgElement.length > 0) {
          let src = imgElement.attr('src');
          if (!src) src = imgElement.attr('data-old-hires'); // High-res version often here
          if (!src) src = imgElement.attr('data-src'); // Sometimes in data-src
          if (src && (src.startsWith('http') || src.startsWith('//'))) {
            productImageURL = src.startsWith('//') ? `https:${src}` : src;
            break; 
          }
        }
      }
      // Fallback for image if still not found
      if (!productImageURL || productImageURL.includes('placehold.co')) {
         const openGraphImage = $('meta[property="og:image"]').attr('content');
         if (openGraphImage) {
            productImageURL = openGraphImage;
         } else {
             productImageURL = `${PLACEHOLDER_IMAGE_BASE}${encodeURIComponent(productName.substring(0,20))}`;
         }
      }


      // 3. Extract Product Description (brief)
      // Attempt 1: Meta description
      let description = $('meta[name="description"]').attr('content');
      if (description) {
        productDescription = description.trim();
      } else {
        // Attempt 2: Feature bullets (first few)
        const featureBullets: string[] = [];
        $('#feature-bullets .a-list-item').each((i, el) => {
          if (i < 3) { // Take up to 3 bullet points
            featureBullets.push($(el).text().trim());
          }
        });
        if (featureBullets.length > 0) {
          productDescription = featureBullets.join(' ');
        } else {
            // Attempt 3: Book description if it's a book
            const bookDesc = $('#bookDescription_feature_div noscript').html(); // Often in noscript for books
            if (bookDesc) {
                const cleanBookDesc = cheerio.load(bookDesc)('div').text().replace(/\s+/g, ' ').trim();
                productDescription = cleanBookDesc.substring(0, 300) + (cleanBookDesc.length > 300 ? '...' : '');
            } else {
                 productDescription = `(No detailed description scraped) Check the product page for more information about ${productName}.`;
            }
        }
      }
      // Limit description length
      if (productDescription.length > 500) {
          productDescription = productDescription.substring(0, 497) + "...";
      }


    } catch (e) {
      console.warn('Full scraping attempt failed, using fallback data:', e instanceof Error ? e.message : String(e));
      // Ensure productName has a somewhat reasonable value if initial scraping failed badly
      if (productName === DEFAULT_PRODUCT_NAME) {
        try {
            const url = new URL(productURL);
            const pathParts = url.pathname.split('/');
            const dpIndex = pathParts.findIndex((part) => part === 'dp');
            if (dpIndex > 0 && pathParts[dpIndex - 1] && pathParts[dpIndex - 1].length > 3) {
                 const potentialName = decodeURIComponent(pathParts[dpIndex - 1].replace(/-/g, ' '));
                 productName = potentialName.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');
            }
        } catch (urlParseError) { /* fallback to default name */ }
      }
      productImageURL = `${PLACEHOLDER_IMAGE_BASE}${encodeURIComponent(productName.substring(0,20))}`;
    }

    return {
      productName: productName || DEFAULT_PRODUCT_NAME,
      productDescription: productDescription || DEFAULT_DESCRIPTION,
      productImageURL: productImageURL || `${PLACEHOLDER_IMAGE_BASE}Product`,
    };
  }
);


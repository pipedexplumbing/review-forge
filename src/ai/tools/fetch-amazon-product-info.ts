
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
const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/80x80.png'; // Standardized size, no text parameter

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        // Using a common browser user-agent might help bypass some basic blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
      },
      // Consider adding a timeout for fetch requests in a production environment
      // next: { revalidate: 60 } // Revalidate cache every 60 seconds
    });
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error during fetch operation for ${url}:`, error);
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
    let productImageURL: string | undefined = PLACEHOLDER_IMAGE_URL;

    const html = await fetchPage(productURL);

    if (!html) {
      console.warn(`HTML content could not be fetched for ${productURL}. Using fallback data.`);
      // Attempt to derive name from URL even if fetch fails
      try {
        const urlObj = new URL(productURL);
        const pathParts = urlObj.pathname.split('/');
        const dpIndex = pathParts.findIndex(part => part === 'dp');
        if (dpIndex > 0 && pathParts[dpIndex -1] && pathParts[dpIndex -1].length > 3) {
            const potentialName = decodeURIComponent(pathParts[dpIndex - 1].replace(/-/g, ' '));
             productName = potentialName.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');
        }
      } catch (e) { /* ignore URL parsing error for name */ }
      
      return {
        productName: productName !== DEFAULT_PRODUCT_NAME ? productName : "Product (Fetching Failed)",
        productDescription: DEFAULT_DESCRIPTION,
        productImageURL: PLACEHOLDER_IMAGE_URL,
      };
    }

    try {
      const $ = cheerio.load(html);

      // 1. Extract Product Title
      const titleElement = $('#productTitle');
      if (titleElement.length > 0) {
        productName = titleElement.text().trim();
      } else {
        const metaTitle = $('head > title').text().trim();
        if (metaTitle) {
            const parts = metaTitle.split(':');
            if (parts.length > 1) {
                productName = parts.slice(1).join(':').trim();
            } else {
                productName = metaTitle;
            }
        }
      }
      if (productName === DEFAULT_PRODUCT_NAME || productName.toLowerCase().startsWith("amazon.com")) {
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
      const imageSelectors = [
        '#landingImage', 
        '#imgBlkFront', 
        '#ebooksImgBlkFront', 
        '#main-image-container img',
        '#imgTagWrapperId img',
      ];
      for (const selector of imageSelectors) {
        const imgElement = $(selector);
        if (imgElement.length > 0) {
          let src = imgElement.attr('src');
          if (!src) src = imgElement.attr('data-old-hires');
          if (!src) src = imgElement.attr('data-src');
          if (src && (src.startsWith('http') || src.startsWith('//'))) {
            productImageURL = src.startsWith('//') ? `https:${src}` : src;
            break; 
          }
        }
      }
      if (!productImageURL || productImageURL === PLACEHOLDER_IMAGE_URL) {
         const openGraphImage = $('meta[property="og:image"]').attr('content');
         if (openGraphImage) {
            productImageURL = openGraphImage;
         } else {
            productImageURL = PLACEHOLDER_IMAGE_URL;
         }
      }


      // 3. Extract Product Description (brief)
      let description = $('meta[name="description"]').attr('content');
      if (description) {
        productDescription = description.trim();
      } else {
        const featureBullets: string[] = [];
        $('#feature-bullets .a-list-item').each((i, el) => {
          if (i < 3) { 
            featureBullets.push($(el).text().trim());
          }
        });
        if (featureBullets.length > 0) {
          productDescription = featureBullets.join(' ');
        } else {
            const bookDesc = $('#bookDescription_feature_div noscript').html(); 
            if (bookDesc) {
                const cleanBookDesc = cheerio.load(bookDesc)('div').text().replace(/\s+/g, ' ').trim();
                productDescription = cleanBookDesc.substring(0, 300) + (cleanBookDesc.length > 300 ? '...' : '');
            } else {
                 productDescription = `(No detailed description scraped) Check the product page for more information about ${productName}.`;
            }
        }
      }
      if (productDescription.length > 500) {
          productDescription = productDescription.substring(0, 497) + "...";
      }

    } catch (e) {
      console.warn('Scraping attempt partially failed or encountered an error, using available/fallback data:', e instanceof Error ? e.message : String(e));
      // Use already derived productName if available, otherwise default
      productName = (productName !== DEFAULT_PRODUCT_NAME) ? productName : "Product (Scraping Error)";
      productImageURL = PLACEHOLDER_IMAGE_URL; // Fallback image on any scraping error
      productDescription = DEFAULT_DESCRIPTION; // Fallback description
    }

    return {
      productName: productName || DEFAULT_PRODUCT_NAME,
      productDescription: productDescription || DEFAULT_DESCRIPTION,
      productImageURL: productImageURL || PLACEHOLDER_IMAGE_URL,
    };
  }
);

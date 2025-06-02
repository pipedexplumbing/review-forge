
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
import * // Import cheerio with a namespace alias
as cheerio from 'cheerio';

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
const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/80x80.png';

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        // Using a common browser user-agent and other headers might help
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br', // Request compressed content
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1', // Do Not Track
      },
      // next: { revalidate: 300 } // Consider caching fetches for a short period
    });
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      const errorBody = await response.text().catch(() => "Could not read error body");
      console.error(`Error body: ${errorBody.substring(0, 500)}...`); // Log part of the error body
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error(`Error during fetch operation for ${url}:`, error);
    return null;
  }
}

// Helper to parse potential JSON from script tags or attributes
function extractJsonFromScripts(html: string, $: cheerio.CheerioAPI): any | null {
    let productJson = null;
    $('script[type="application/ld+json"]').each((i, el) => {
        try {
            const scriptContent = $(el).html();
            if (scriptContent) {
                const parsedJson = JSON.parse(scriptContent);
                // Look for product-specific types
                if (parsedJson['@type'] === 'Product' || (Array.isArray(parsedJson['@graph']) && parsedJson['@graph'].find((item: any) => item['@type'] === 'Product'))) {
                    productJson = parsedJson['@type'] === 'Product' ? parsedJson : parsedJson['@graph'].find((item: any) => item['@type'] === 'Product');
                    return false; // Stop searching if product JSON is found
                }
            }
        } catch (e) {
            // console.warn('Failed to parse LD+JSON script content:', e);
        }
    });

    if (productJson) return productJson;

    // Look for other script tags that might initialize global JS variables with product data
    // This is highly specific and brittle, patterns need to be identified from actual pages
    $('script').each((i, el) => {
        const scriptContent = $(el).html();
        if (scriptContent) {
            // Example: Look for data assigned to window.customerData or similar
            const match = scriptContent.match(/jQuery\.parseJSON\s*\(\s*'(.*?)'\s*\)/);
            if (match && match[1]) {
                try {
                    const jsonData = JSON.parse(match[1].replace(/\\'/g, "'")); // Simple unescape
                    // Check if this JSON looks like product data (e.g., has 'asin', 'title')
                    if (jsonData && (jsonData.asin || jsonData.title || jsonData.productTitle)) {
                        productJson = jsonData;
                        return false;
                    }
                } catch (e) { /* console.warn('Failed to parse specific JSON pattern from script:', e); */ }
            }
             // Another common pattern: data embedded in data-a-state or similar
            const dataAStateMatch = scriptContent.match(/var dataToReturn = ({.*?});/s); // More generic
            if (dataAStateMatch && dataAStateMatch[1]) {
                try {
                    const jsonData = JSON.parse(dataAStateMatch[1]);
                    if (jsonData && (jsonData.asin || jsonData.title || jsonData.landingAsin)) {
                         productJson = jsonData;
                         return false;
                    }
                } catch(e) { /* console.warn('Failed to parse dataToReturn JSON', e) */ }
            }
        }
    });
    return productJson;
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
      console.warn(`HTML content could not be fetched for ${productURL}. Attempting to derive name from URL.`);
      try {
        const urlObj = new URL(productURL);
        const pathParts = urlObj.pathname.split('/');
        const dpIndex = pathParts.findIndex(part => part === 'dp');
        if (dpIndex > 0 && pathParts[dpIndex - 1] && pathParts[dpIndex - 1].length > 3) {
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

      // Attempt to parse structured JSON data first
      const embeddedJson = extractJsonFromScripts(html, $);
      if (embeddedJson) {
        // console.log("Found embedded JSON data:", JSON.stringify(embeddedJson, null, 2).substring(0, 500));
        if (embeddedJson.name) productName = embeddedJson.name;
        if (embeddedJson.description) productDescription = embeddedJson.description.substring(0, 500) + (embeddedJson.description.length > 500 ? '...' : '');
        if (embeddedJson.image && (typeof embeddedJson.image === 'string')) productImageURL = embeddedJson.image;
        else if (embeddedJson.image && Array.isArray(embeddedJson.image) && embeddedJson.image.length > 0) productImageURL = embeddedJson.image[0];
        else if (embeddedJson.image && typeof embeddedJson.image === 'object' && embeddedJson.image.url) productImageURL = embeddedJson.image.url;

        // If specific fields still default, try common scraper patterns as backup
        if (productName === DEFAULT_PRODUCT_NAME) productName = $('#productTitle').text().trim() || $('meta[property="og:title"]').attr('content') || $('head > title').text().split(':')[0].trim() || productName;
        if (productDescription === DEFAULT_DESCRIPTION) productDescription = $('meta[name="description"]').attr('content')?.trim() || $('meta[property="og:description"]').attr('content')?.trim() || productDescription;
        if (productImageURL === PLACEHOLDER_IMAGE_URL) productImageURL = $('meta[property="og:image"]').attr('content') || $('#landingImage').attr('src') || productImageURL;
      } else {
        // Fallback to direct scraping if no useful JSON found
        // 1. Extract Product Title
        productName = $('#productTitle').text().trim() ||
                      $('meta[property="og:title"]').attr('content')?.trim() ||
                      $('meta[name="twitter:title"]').attr('content')?.trim() ||
                      productName; // Keep previous if already derived from URL and others fail

        // If title is still default or an Amazon domain, try to refine from page title tag
        if (productName === DEFAULT_PRODUCT_NAME || productName.toLowerCase().startsWith("amazon.com") || productName.toLowerCase().startsWith("cookies Notification")) {
             const pageTitle = $('head > title').text().trim();
             if (pageTitle) {
                 const titleParts = pageTitle.split(/[:|]/); // Split by colon or pipe
                 productName = titleParts[0].trim(); // Take the first part
                 if (productName.toLowerCase().startsWith("amazon.com") && titleParts.length > 1) {
                    productName = titleParts[1].trim(); // Try second part if first is still generic
                 }
             }
        }
         // Final fallback for name from URL if scraping fails badly
        if (productName === DEFAULT_PRODUCT_NAME || productName.toLowerCase().startsWith("amazon.com") || productName.toLowerCase().startsWith("cookies notification")) {
            try {
                const urlObj = new URL(productURL);
                const pathParts = urlObj.pathname.split('/');
                const dpIndex = pathParts.findIndex(part => part === 'dp');
                if (dpIndex > 0 && pathParts[dpIndex - 1] && pathParts[dpIndex - 1].length > 5) {
                    const potentialName = decodeURIComponent(pathParts[dpIndex - 1].replace(/-/g, ' '));
                    productName = potentialName.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');
                }
            } catch (e) { /* ignore */ }
        }


        // 2. Extract Product Image URL
        let foundImage = $('meta[property="og:image"]').attr('content') ||
                         $('meta[name="twitter:image"]').attr('content');
        if (foundImage) {
            productImageURL = foundImage;
        } else {
            const imageSelectors = [
                '#landingImage', // Primary image
                '#imgBlkFront', // Books, etc.
                '#ebooksImgBlkFront',
                '#imgTagWrapperId img', // Common wrapper
                '#ivLargeImage img', // Image viewer
                '.imgTagWrapper img',
                '#main-image-container img',
            ];
            for (const selector of imageSelectors) {
                const imgElement = $(selector).first();
                if (imgElement.length > 0) {
                let src = imgElement.attr('src') || imgElement.attr('data-src') || imgElement.attr('data-old-hires');
                if (src && (src.startsWith('http') || src.startsWith('//'))) {
                    productImageURL = src.startsWith('//') ? `https:${src}` : src;
                    break;
                }
                // Try data-a-dynamic-image for JSON with image URLs
                const dynamicImageJson = imgElement.attr('data-a-dynamic-image');
                if (dynamicImageJson) {
                    try {
                        const dynamicImages = JSON.parse(dynamicImageJson);
                        const firstImageKey = Object.keys(dynamicImages)[0];
                        if (firstImageKey) {
                            productImageURL = firstImageKey;
                            break;
                        }
                    } catch (e) { /* console.warn('Failed to parse data-a-dynamic-image JSON'); */ }
                }
                }
            }
        }
         if (!productImageURL || productImageURL === PLACEHOLDER_IMAGE_URL) {
            // Final fallback to placeholder if nothing is found
            productImageURL = PLACEHOLDER_IMAGE_URL;
        }


        // 3. Extract Product Description (brief)
        let description = $('meta[property="og:description"]').attr('content')?.trim() ||
                          $('meta[name="twitter:description"]').attr('content')?.trim() ||
                          $('meta[name="description"]').attr('content')?.trim();
        
        if (description) {
            productDescription = description;
        } else {
            const featureBullets: string[] = [];
            $('#feature-bullets .a-list-item').each((i, el) => {
                if (i < 4) { // Get up to 4 feature bullets
                featureBullets.push($(el).text().trim().replace(/\s+/g, ' '));
                }
            });
            if (featureBullets.length > 0) {
                productDescription = featureBullets.join('. ') + '.';
            } else {
                // Try book description (often in noscript or specific divs)
                let bookDescHtml = $('#bookDescription_feature_div noscript').html() || $('#bookDescription_feature_div .a-expander-content').html();
                if (bookDescHtml) {
                    const tempDesc = cheerio.load(bookDescHtml)('body').text().replace(/\s+/g, ' ').trim();
                    productDescription = tempDesc.substring(0, 450) + (tempDesc.length > 450 ? '...' : '');
                } else {
                    // Generic fallback if no description found
                    productDescription = `(No detailed description scraped) Check the product page for more information about ${productName === DEFAULT_PRODUCT_NAME ? 'this product' : productName}.`;
                }
            }
        }
      } // End of else (no embedded JSON found)

      // Sanitize and truncate
      productName = productName.replace(/\s+/g, ' ').trim();
      if (productName.length > 150) productName = productName.substring(0, 147) + "...";
      if (productName === "" || productName.toLowerCase().includes("cookies notification") || productName.toLowerCase().includes("amazon.com")) productName = DEFAULT_PRODUCT_NAME;


      productDescription = productDescription.replace(/\s+/g, ' ').trim();
      if (productDescription.length > 500) {
          productDescription = productDescription.substring(0, 497) + "...";
      }
       if (productDescription === "") productDescription = DEFAULT_DESCRIPTION;


      // Ensure image URL is valid or placeholder
      try {
        if (productImageURL && productImageURL !== PLACEHOLDER_IMAGE_URL) {
            new URL(productImageURL); // Validate URL
        } else {
            productImageURL = PLACEHOLDER_IMAGE_URL;
        }
      } catch (e) {
        // console.warn("Invalid image URL found:", productImageURL, "Falling back to placeholder.");
        productImageURL = PLACEHOLDER_IMAGE_URL;
      }


    } catch (e) {
      console.warn('Scraping attempt partially failed or encountered an error, using available/fallback data:', e instanceof Error ? e.message : String(e));
      // Use already derived productName if available, otherwise default
      productName = (productName && productName !== DEFAULT_PRODUCT_NAME) ? productName : "Product (Scraping Error)";
      productDescription = (productDescription && productDescription !== DEFAULT_DESCRIPTION) ? productDescription : DEFAULT_DESCRIPTION;
      productImageURL = PLACEHOLDER_IMAGE_URL;
    }
    
    // console.log("Scraped Info:", { productName, productDescription, productImageURL });

    return {
      productName: productName || DEFAULT_PRODUCT_NAME,
      productDescription: productDescription || DEFAULT_DESCRIPTION,
      productImageURL: productImageURL || PLACEHOLDER_IMAGE_URL,
    };
  }
);

    
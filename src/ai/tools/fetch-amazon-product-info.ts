
'use server';
/**
 * @fileOverview AI Tool for fetching product information (name, description, image) from an Amazon product link
 * using the Apify actor "axesso_data~amazon-product-details-scraper".
 *
 * - fetchAmazonProductInfoTool - An AI tool that calls an Apify actor to get product details.
 * - FetchAmazonProductInfoInput - Input schema for the tool (Amazon product URL).
 * - FetchAmazonProductInfoOutput - Output schema for the tool (product name, description, image URL).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

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
  productImageURL: z.string().url().optional().describe('A URL for the main product image, if found.'),
});
export type FetchAmazonProductInfoOutput = z.infer<typeof FetchAmazonProductInfoOutputSchema>;

const DEFAULT_PRODUCT_NAME = 'Product (Details Fetching Failed)';
const DEFAULT_DESCRIPTION = 'Could not fetch detailed product description. Please refer to the Amazon page.';
const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/80x80.png';


// Helper function to extract ASIN and domain code from Amazon URL
function extractAsinAndDomain(productURL: string): { asin: string | null; domainCode: string | null } {
  try {
    const url = new URL(productURL);
    const hostname = url.hostname;

    const asinMatch = productURL.match(/\/(?:dp|gp\/product|-)\/([A-Z0-9]{10})/);
    const asin = asinMatch ? asinMatch[1] : null;

    let domainCode: string | null = null;
    if (hostname.includes('amazon.')) {
      const parts = hostname.split('amazon.');
      if (parts.length > 1) {
        domainCode = parts[1];
        if (domainCode.startsWith('www.')) {
            domainCode = domainCode.substring(4);
        }
        if (domainCode.includes('/')) {
            domainCode = domainCode.split('/')[0];
        }
      }
    }
    return { asin, domainCode };
  } catch (error) {
    console.error('Error parsing Amazon URL for ASIN/domain:', error);
    return { asin: null, domainCode: null };
  }
}

export const fetchAmazonProductInfoTool = ai.defineTool(
  {
    name: 'fetchAmazonProductInfoTool',
    description:
      'Fetches Amazon product details (name, description, image) using the Apify actor "axesso_data~amazon-product-details-scraper". Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonProductInfoInputSchema,
    outputSchema: FetchAmazonProductInfoOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonProductInfoOutput> => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('APIFY_API_TOKEN environment variable is not set for product details scraper.');
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
        productImageURL: PLACEHOLDER_IMAGE_URL,
      };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL);

    if (!asin || !domainCode) {
      console.error(`Could not extract ASIN or domain code from URL for product details: ${productURL}`);
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
        productImageURL: PLACEHOLDER_IMAGE_URL,
      };
    }

    const actorId = 'axesso_data~amazon-product-details-scraper';
    const apifyApiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
      input: [
        {
          asin: asin,
          domainCode: domainCode,
          // Add any other specific parameters for this actor if needed, e.g., 'proxyCountry' or 'language'
          // For now, keeping it minimal. Refer to axesso_data~amazon-product-details-scraper docs for options.
        },
      ],
    };

    console.log(`Calling Apify actor ${actorId} with input:`, JSON.stringify(actorInput, null, 2));

    try {
      const response = await fetch(apifyApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actorInput),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Could not read error body");
        console.error(
          `Apify product details API request failed for ASIN ${asin} (${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}`
        );
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
          productImageURL: PLACEHOLDER_IMAGE_URL,
        };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems) || datasetItems.length === 0) {
        console.warn(`Apify product details API for ASIN ${asin} returned no items or unexpected format:`, datasetItems);
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
          productImageURL: PLACEHOLDER_IMAGE_URL,
        };
      }

      const productData = datasetItems[0] as any; // Assuming the first item is the main product data

      // Extract data based on common patterns for such actors. Field names might need adjustment.
      const productName = productData?.title || productData?.productTitle || DEFAULT_PRODUCT_NAME;
      
      let productDescription = DEFAULT_DESCRIPTION;
      if (productData?.description) {
        productDescription = productData.description;
      } else if (Array.isArray(productData?.featureBullets) && productData.featureBullets.length > 0) {
        productDescription = productData.featureBullets.join('. ').substring(0, 500) + (productData.featureBullets.join('. ').length > 500 ? '...' : '');
      } else if (productData?.shortDescription) {
        productDescription = productData.shortDescription;
      }
      
      let productImageURL = PLACEHOLDER_IMAGE_URL;
      if (productData?.mainImage?.link) {
        productImageURL = productData.mainImage.link;
      } else if (Array.isArray(productData?.images) && productData.images.length > 0 && productData.images[0]?.link) {
        productImageURL = productData.images[0].link;
      } else if (typeof productData?.imageUrl === 'string') {
        productImageURL = productData.imageUrl;
      }
      
      // Validate and sanitize
      const finalProductName = (typeof productName === 'string' ? productName.trim() : DEFAULT_PRODUCT_NAME).substring(0,150);
      const finalProductDescription = (typeof productDescription === 'string' ? productDescription.trim() : DEFAULT_DESCRIPTION).substring(0,500);
      let finalProductImageURL = PLACEHOLDER_IMAGE_URL;
      try {
        if (productImageURL && productImageURL !== PLACEHOLDER_IMAGE_URL) {
            new URL(productImageURL); // Validate URL
            finalProductImageURL = productImageURL;
        }
      } catch (e) { /*  Ignore invalid URL, stick to placeholder */ }


      console.log(`Fetched product details from Apify for ASIN ${asin}: Name: ${finalProductName.substring(0,50)}...`);
      return {
        productName: finalProductName || DEFAULT_PRODUCT_NAME,
        productDescription: finalProductDescription || DEFAULT_DESCRIPTION,
        productImageURL: finalProductImageURL,
      };

    } catch (error) {
      console.error(`Error calling Apify product details API or processing data for ASIN ${asin} (${productURL}):`, error);
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
        productImageURL: PLACEHOLDER_IMAGE_URL,
      };
    }
  }
);

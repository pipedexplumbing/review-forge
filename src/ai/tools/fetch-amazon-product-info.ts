
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
  // productImageURL: z.string().url().optional().describe('The URL of the main product image, if available.')
});
export type FetchAmazonProductInfoOutput = z.infer<typeof FetchAmazonProductInfoOutputSchema>;

const DEFAULT_PRODUCT_NAME = 'Product (Details Fetching Failed)';
const DEFAULT_DESCRIPTION = 'Could not fetch detailed product description. Please refer to the Amazon page.';


// Helper function to extract ASIN and domain code from Amazon URL
function extractAsinAndDomain(productURL: string): { asin: string | null; domainCode: string | null } {
  try {
    const url = new URL(productURL);
    const hostname = url.hostname;

    let asin: string | null = null;

    // Attempt 1: Extract ASIN from query parameter (e.g., /review/create-review/?asin=B0F4KZ6DRY)
    const asinFromQuery = url.searchParams.get('asin');
    if (asinFromQuery && /^[A-Z0-9]{10}$/.test(asinFromQuery)) {
      asin = asinFromQuery;
      // console.log(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Extracted ASIN from query parameter: ${asin}`);
    }

    // Attempt 2: Extract ASIN from path if not found in query (e.g., /dp/ASIN, /gp/product/ASIN)
    if (!asin) {
      const asinMatch = productURL.match(/\/(?:dp|gp\/product|-)\/([A-Z0-9]{10})/);
      if (asinMatch) {
        asin = asinMatch[1];
        // console.log(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Extracted ASIN from path: ${asin}`);
      }
    }

    let domainCode: string | null = null;
    if (hostname.includes('amazon.')) {
      const parts = hostname.split('amazon.');
      if (parts.length > 1) {
        domainCode = parts[1];
        // Normalize domain code (e.g., www.amazon.com -> com, amazon.co.uk -> co.uk)
        if (domainCode.startsWith('www.')) {
            domainCode = domainCode.substring(4);
        }
        if (domainCode.includes('/')) { // remove any path
            domainCode = domainCode.split('/')[0];
        }
      }
    }

    if (!asin) console.warn(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Could not extract ASIN from URL (checked path and 'asin' query param): ${productURL}`);
    if (!domainCode) console.warn(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Could not extract domainCode from URL: ${productURL}`);
    
    return { asin, domainCode };
  } catch (error) {
    console.error('[fetchAmazonProductInfoTool - extractAsinAndDomain] Error parsing Amazon URL:', error);
    return { asin: null, domainCode: null };
  }
}

export const fetchAmazonProductInfoTool = ai.defineTool(
  {
    name: 'fetchAmazonProductInfoTool',
    description:
      'Fetches Amazon product details (name, description) using the Apify actor "axesso_data~amazon-product-details-scraper". Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonProductInfoInputSchema,
    outputSchema: FetchAmazonProductInfoOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonProductInfoOutput> => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('[fetchAmazonProductInfoTool] APIFY_API_TOKEN environment variable is not set. Returning default info.');
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
      };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL);

    if (!asin || !domainCode) {
      console.error(`[fetchAmazonProductInfoTool] Could not extract ASIN or domainCode from URL: ${productURL}. Returning default info.`);
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
      };
    }

    const actorId = 'axesso_data~amazon-product-details-scraper';
    const apifyApiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
      input: [
        {
          asin: asin,
          domainCode: domainCode,
        },
      ],
    };

    // console.log(`[fetchAmazonProductInfoTool] Calling Apify actor ${actorId} for ASIN ${asin}, domain ${domainCode}`);

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
          `[fetchAmazonProductInfoTool] Apify API request failed for ASIN ${asin} (${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}. Returning default info.`
        );
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
        };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems) || datasetItems.length === 0 || typeof datasetItems[0] !== 'object' || datasetItems[0] === null) {
        // console.warn(`[fetchAmazonProductInfoTool] Apify API for ASIN ${asin} returned no items or unexpected format. Dataset:`, JSON.stringify(datasetItems, null, 2).substring(0,500));
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
        };
      }

      const productData = datasetItems[0] as any;
      // console.log(`[fetchAmazonProductInfoTool] Received productData for ASIN ${asin}. Attempting to extract details.`);
      
      const productName = productData?.title || DEFAULT_PRODUCT_NAME;
      
      let productDescription = productData?.productDescription || "";
      if (Array.isArray(productData?.features) && productData.features.length > 0) {
        const featuresText = productData.features.join('. ');
        if (productDescription && productDescription.length < 20 && featuresText.length > productDescription.length) { // Prioritize longer features if desc is too short
          productDescription = featuresText;
        } else if (productDescription) {
          productDescription += '. ' + featuresText;
        } else {
          productDescription = featuresText;
        }
      }
       if (!productDescription && productData?.aboutProduct && Array.isArray(productData.aboutProduct)) {
        productDescription = productData.aboutProduct.map((item: any) => item.value || "").join(". ");
      }

      if (!productDescription) {
        productDescription = DEFAULT_DESCRIPTION;
      }
      
      const finalProductName = (typeof productName === 'string' ? productName.trim() : DEFAULT_PRODUCT_NAME).substring(0,200);
      const finalProductDescription = (typeof productDescription === 'string' ? productDescription.trim() : DEFAULT_DESCRIPTION).substring(0,1500);
      
      // console.log(`[fetchAmazonProductInfoTool] Extracted product details from Apify for ASIN ${asin}: Name: ${finalProductName.substring(0,50)}...`);
      return {
        productName: finalProductName,
        productDescription: finalProductDescription,
      };

    } catch (error) {
      console.error(`[fetchAmazonProductInfoTool] Error calling Apify API or processing data for ASIN ${asin} (${productURL}):`, error);
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
      };
    }
  }
);

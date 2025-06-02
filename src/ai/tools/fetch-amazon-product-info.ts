
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
    if (!asin) console.warn(`[extractAsinAndDomain] Could not extract ASIN from URL: ${productURL}`);
    if (!domainCode) console.warn(`[extractAsinAndDomain] Could not extract domainCode from URL: ${productURL}`);
    return { asin, domainCode };
  } catch (error) {
    console.error('[extractAsinAndDomain] Error parsing Amazon URL:', error);
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
      console.error('[fetchAmazonProductInfoTool] APIFY_API_TOKEN environment variable is not set.');
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
        productImageURL: PLACEHOLDER_IMAGE_URL,
      };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL);

    if (!asin || !domainCode) {
      console.error(`[fetchAmazonProductInfoTool] Could not extract ASIN or domainCode from URL: ${productURL}. Returning default info.`);
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
        },
      ],
    };

    console.log(`[fetchAmazonProductInfoTool] Calling Apify actor ${actorId} for ASIN ${asin}, domain ${domainCode}`);

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
          `[fetchAmazonProductInfoTool] Apify API request failed for ASIN ${asin} (${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}`
        );
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
          productImageURL: PLACEHOLDER_IMAGE_URL,
        };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems) || datasetItems.length === 0) {
        console.warn(`[fetchAmazonProductInfoTool] Apify API for ASIN ${asin} returned no items or unexpected format:`, datasetItems);
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
          productImageURL: PLACEHOLDER_IMAGE_URL,
        };
      }

      const productData = datasetItems[0] as any;
      console.log(`[fetchAmazonProductInfoTool] Received productData for ASIN ${asin}. Attempting to extract details.`);

      const productName = productData?.title || DEFAULT_PRODUCT_NAME;
      
      let productDescription = productData?.productDescription || DEFAULT_DESCRIPTION;
      if (Array.isArray(productData?.features) && productData.features.length > 0) {
        const featuresText = productData.features.join('. ');
        if (productDescription === DEFAULT_DESCRIPTION || productDescription.length < featuresText.length) {
          productDescription = featuresText;
        } else if (productDescription !== DEFAULT_DESCRIPTION) {
          productDescription += '. ' + featuresText;
        }
      }
      
      let extractedImageURL: string | undefined = undefined;

      if (productData?.mainImage?.imageUrl && typeof productData.mainImage.imageUrl === 'string') {
        extractedImageURL = productData.mainImage.imageUrl;
        console.log(`[fetchAmazonProductInfoTool] Image found in mainImage.imageUrl: ${extractedImageURL}`);
      } else if (Array.isArray(productData?.imageUrlList) && productData.imageUrlList.length > 0 && typeof productData.imageUrlList[0] === 'string') {
        extractedImageURL = productData.imageUrlList[0];
        console.log(`[fetchAmazonProductInfoTool] Image found in imageUrlList[0]: ${extractedImageURL}`);
      }

      if (!extractedImageURL && productData) {
        console.warn(`[fetchAmazonProductInfoTool] No specific image URL found for ASIN ${asin} via mainImage.imageUrl or imageUrlList[0].`);
        console.warn('[fetchAmazonProductInfoTool] ProductData keys:', Object.keys(productData).join(', '));
        if (productData.mainImage) console.warn('[fetchAmazonProductInfoTool] MainImage object keys:', Object.keys(productData.mainImage).join(', '));
        else console.warn('[fetchAmazonProductInfoTool] productData.mainImage is undefined or null');
        if (productData.imageUrlList) console.warn('[fetchAmazonProductInfoTool] imageUrlList exists. Length:', productData.imageUrlList.length, 'First item type:', typeof productData.imageUrlList[0]);
        else console.warn('[fetchAmazonProductInfoTool] productData.imageUrlList is undefined or null');
      }
      
      const finalProductName = (typeof productName === 'string' ? productName.trim() : DEFAULT_PRODUCT_NAME).substring(0,150);
      const finalProductDescription = (typeof productDescription === 'string' ? productDescription.trim() : DEFAULT_DESCRIPTION).substring(0,1000);
      
      let finalProductImageURL = PLACEHOLDER_IMAGE_URL;
      if (extractedImageURL) {
        console.log(`[fetchAmazonProductInfoTool] Attempting to validate extractedImageURL: "${extractedImageURL}"`);
        try {
          new URL(extractedImageURL); 
          finalProductImageURL = extractedImageURL;
          console.log(`[fetchAmazonProductInfoTool] Validated. finalProductImageURL set to: "${finalProductImageURL}"`);
        } catch (e) {
          console.warn(`[fetchAmazonProductInfoTool] Invalid image URL from Apify: "${extractedImageURL}". Error: ${e instanceof Error ? e.message : String(e)}. Falling back to placeholder.`);
        }
      } else {
         console.log('[fetchAmazonProductInfoTool] No extractedImageURL was found or set, finalProductImageURL remains placeholder.');
      }

      console.log(`[fetchAmazonProductInfoTool] Fetched product details from Apify for ASIN ${asin}: Name: ${finalProductName.substring(0,50)}... Image URL: ${finalProductImageURL}`);
      return {
        productName: finalProductName,
        productDescription: finalProductDescription,
        productImageURL: finalProductImageURL,
      };

    } catch (error) {
      console.error(`[fetchAmazonProductInfoTool] Error calling Apify API or processing data for ASIN ${asin} (${productURL}):`, error);
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
        productImageURL: PLACEHOLDER_IMAGE_URL,
      };
    }
  }
);

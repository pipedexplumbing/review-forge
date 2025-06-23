
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
  productImageURL: z.string().url().optional().describe('The URL of the main product image, if available.'),
});
export type FetchAmazonProductInfoOutput = z.infer<typeof FetchAmazonProductInfoOutputSchema>;

// Helper function to extract ASIN and domain code from Amazon URL
function extractAsinAndDomain(productURL: string, toolName: string): { asin: string; domainCode: string } {
  const trimmedProductURL = productURL.trim();
  console.log(`[${toolName}] Processing URL: ${trimmedProductURL}`);
  let asin: string | null = null;
  let domainCode: string | null = null;
  let hostname: string | null = null;

  // --- Step 1: Try parsing with the URL constructor (most reliable) ---
  try {
    const url = new URL(trimmedProductURL);
    hostname = url.hostname;
    console.log(`[${toolName}] Parsed hostname: ${hostname}`);

    const asinFromQuery = url.searchParams.get('asin');
    if (asinFromQuery && /^[A-Z0-9]{10}$/i.test(asinFromQuery)) {
      asin = asinFromQuery.toUpperCase();
      console.log(`[${toolName}] Found valid ASIN in query params: ${asin}`);
    }

    // If no ASIN from query, check path
    if (!asin) {
      const pathPatterns = [
        /\/(?:dp|gp\/product|-|d)\/([A-Z0-9]{10})/i,
        /\/gp\/aw\/d\/([A-Z0-9]{10})/i
      ];
      for (const pattern of pathPatterns) {
        const match = url.pathname.match(pattern);
        if (match && match[1]) {
          const potentialAsin = match[1].toUpperCase();
          if (/^[A-Z0-9]{10}$/.test(potentialAsin)) {
            asin = potentialAsin;
            console.log(`[${toolName}] Found ASIN in path: ${asin}`);
            break;
          }
        }
      }
    }
  } catch (error) {
    console.warn(`[${toolName}] Could not parse URL with new URL(). Will try regex fallbacks. Error:`, error);
    const hostnameMatch = trimmedProductURL.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
    if (hostnameMatch && hostnameMatch[1]) {
        hostname = hostnameMatch[1];
        console.log(`[${toolName}] Extracted hostname with regex: ${hostname}`);
    }
  }

  // --- Step 2: Last-resort regex fallback for ASIN on the raw string ---
  if (!asin) {
    console.log(`[${toolName}] ASIN not found yet, trying raw string regex fallback.`);
    const asinMatch = trimmedProductURL.match(/(?:asin=|dp\/|d\/)([A-Z0-9]{10})/i);
    if (asinMatch && asinMatch[1]) {
        const potentialAsin = asinMatch[1].toUpperCase();
        if (/^[A-Z0-9]{10}$/.test(potentialAsin)) {
            asin = potentialAsin;
            console.log(`[${toolName}] Found ASIN with raw string regex: ${asin}`);
        }
    }
  }
  
  // --- Step 3: Domain Extraction (requires hostname) ---
  if (hostname) {
    const knownTLDs = ['com', 'co.uk', 'de', 'fr', 'es', 'it', 'co.jp', 'cn', 'in', 'com.br', 'com.mx', 'com.au', 'ca'];
    let matchedTld: string | undefined;

    for (const tld of knownTLDs) {
      if (hostname.endsWith(`amazon.${tld}`)) {
        matchedTld = tld;
        break;
      }
    }
    
    if (matchedTld) {
      domainCode = matchedTld;
    } else if (hostname.includes('amazon.')) { 
      const parts = hostname.split('amazon.');
      if (parts.length > 1) {
         const potentialDomainCode = parts[parts.length - 1].split('/')[0];
         if (potentialDomainCode.length > 0 && potentialDomainCode.length <= 10) { 
            domainCode = potentialDomainCode;
        }
      }
    }

    if (domainCode) {
        if (domainCode === "uk") domainCode = "co.uk";
        if (domainCode === "jp") domainCode = "co.jp";
        console.log(`[${toolName}] Extracted domainCode: ${domainCode}`);
    }
  }

  if (!asin) {
    console.error(`[${toolName}] FINAL: Could not extract ASIN from URL: ${trimmedProductURL}`);
    throw new Error(`Could not extract a valid ASIN from the URL.`);
  }
  if (!domainCode) {
    console.error(`[${toolName}] FINAL: Could not extract domainCode from URL: ${trimmedProductURL}`);
    throw new Error(`Could not extract a valid Amazon domain (e.g., 'com', 'co.uk') from the URL.`);
  }

  return { asin, domainCode };
}


export const fetchAmazonProductInfoTool = ai.defineTool(
  {
    name: 'fetchAmazonProductInfoTool',
    description:
      'Fetches Amazon product details (name, description, image URL) using the Apify actor "axesso_data~amazon-product-details-scraper". Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonProductInfoInputSchema,
    outputSchema: FetchAmazonProductInfoOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonProductInfoOutput> => {
    const toolName = 'fetchAmazonProductInfoTool';
    console.log(`[${toolName}] Received URL: ${productURL}`);
    
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error(`[${toolName}] APIFY_API_TOKEN environment variable is not set.`);
      throw new Error('APIFY_API_TOKEN environment variable is not set.');
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL, toolName);

    const actorId = 'axesso_data~amazon-product-details-scraper';
    const apifyApiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
        "startUrls": [
            {
                "url": `https://www.amazon.${domainCode}/dp/${asin}`
            }
        ],
        "includeReviews": false,
        "proxy": {
            "useApifyProxy": true,
            "apifyProxyGroups": [
                "RESIDENTIAL"
            ]
        }
    };

    console.log(`[${toolName}] Calling Apify with input: ${JSON.stringify(actorInput, null, 2)}`);
    const response = await fetch(apifyApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    });

    console.log(`[${toolName}] Apify response status for ASIN ${asin}: ${response.status}`);
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Could not read error body");
      console.error(`[${toolName}] Apify API request failed: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}.`);
      throw new Error(`Apify API request failed with status ${response.status}: ${response.statusText}.`);
    }

    const datasetItems: unknown = await response.json();
    
    if (!Array.isArray(datasetItems) || datasetItems.length === 0 || typeof datasetItems[0] !== 'object' || datasetItems[0] === null) {
      console.error(`[${toolName}] Apify returned no valid data for ASIN ${asin}.`);
      throw new Error(`Apify returned no valid data for product ASIN ${asin}. The product may not exist or is unavailable.`);
    }

    const productData = datasetItems[0] as any;
    console.log(`[${toolName}] Received productData from Apify for ASIN ${asin}.`);
    
    const productName = productData?.title;
    if (!productName || typeof productName !== 'string' || productName.trim() === '') {
        console.error(`[${toolName}] Apify data for ASIN ${asin} is missing a valid title.`);
        throw new Error(`Apify data for ASIN ${asin} is missing a valid title.`);
    }
    
    let productDescription = productData?.productDescription || "";
    if (Array.isArray(productData?.features) && productData.features.length > 0) {
      const featuresText = productData.features.join('. ');
      productDescription = productDescription ? `${productDescription}. ${featuresText}` : featuresText;
    }
    if (!productDescription && productData?.aboutProduct && Array.isArray(productData.aboutProduct)) {
      productDescription = productData.aboutProduct.map((item: any) => item.value || "").join(". ");
    }
    if (!productDescription) {
        productDescription = "No detailed product description available.";
    }
    
    let productImageURL: string | undefined = undefined;
    if (productData?.imageUrl && typeof productData.imageUrl === 'string') {
      productImageURL = productData.imageUrl;
    } else if (productData?.mainImage?.link && typeof productData.mainImage.link === 'string') {
      productImageURL = productData.mainImage.link;
    } else if (Array.isArray(productData?.images) && productData.images.length > 0 && productData.images[0]?.link && typeof productData.images[0].link === 'string') {
      productImageURL = productData.images[0].link;
    }
    console.log(`[${toolName}] Extracted productImageURL for ASIN ${asin}: ${productImageURL}`);

    const finalProductName = productName.trim().substring(0,200);
    const finalProductDescription = productDescription.trim().substring(0,1500);
    
    console.log(`[${toolName}] Successfully processed Apify data for ASIN ${asin}.`);
    return {
      productName: finalProductName,
      productDescription: finalProductDescription,
      productImageURL: productImageURL,
    };
  }
);

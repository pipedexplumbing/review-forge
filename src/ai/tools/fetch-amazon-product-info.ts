
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
});
export type FetchAmazonProductInfoOutput = z.infer<typeof FetchAmazonProductInfoOutputSchema>;

const DEFAULT_PRODUCT_NAME = 'Product (Details Fetching Failed)';
const DEFAULT_DESCRIPTION = 'Could not fetch detailed product description. Please refer to the Amazon page.';

// Helper function to extract ASIN and domain code from Amazon URL
function extractAsinAndDomain(productURL: string): { asin: string | null; domainCode: string | null } {
  try {
    const url = new URL(productURL);
    const hostname = url.hostname; // e.g. "www.amazon.com" or "amazon.com"
    let asin: string | null = null;

    // Attempt 1: Extract ASIN from query parameter "asin"
    const asinFromQuery = url.searchParams.get('asin');
    if (asinFromQuery && /^[A-Z0-9]{10}$/i.test(asinFromQuery)) {
      asin = asinFromQuery.toUpperCase();
    }

    // Attempt 2: Extract ASIN from common path patterns if not found in query
    if (!asin) {
      const pathPatterns = [
        /\/(?:dp|gp\/product|-|d)\/([A-Z0-9]{10})/i, // Common patterns like /dp/ASIN, /gp/product/ASIN, /d/ASIN
        /\/gp\/aw\/d\/([A-Z0-9]{10})/i // Another pattern /gp/aw/d/ASIN
      ];
      for (const pattern of pathPatterns) {
        const match = url.pathname.match(pattern); // Use url.pathname here
        if (match && match[1]) {
          asin = match[1].toUpperCase();
          break;
        }
      }
    }

    let domainCode: string | null = null;
    const knownTLDs = ['com', 'co.uk', 'de', 'fr', 'es', 'it', 'co.jp', 'cn', 'in', 'com.br', 'com.mx', 'com.au', 'ca'];
    let matchedTld: string | undefined = undefined;

    for (const tld of knownTLDs) {
      // Check against "amazon.TLD" and "www.amazon.TLD"
      if (hostname.endsWith(`amazon.${tld}`)) {
        matchedTld = tld;
        break;
      }
    }

    if (matchedTld) {
      domainCode = matchedTld;
    } else if (hostname.includes('amazon.')) { // Fallback for less common TLDs or structures
      const parts = hostname.split('amazon.');
      if (parts.length > 1) {
        // Get the last part after "amazon." and remove any trailing path components
        domainCode = parts[parts.length - 1].split('/')[0];
      }
    }
    
    // Normalize common country codes that might need adjustment
    if (domainCode === "uk") domainCode = "co.uk"; // From amazon.uk to amazon.co.uk
    if (domainCode === "jp") domainCode = "co.jp"; // From amazon.jp to amazon.co.jp


    if (!asin) {
      console.warn(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Could not extract ASIN from URL (checked query 'asin' and common path patterns): ${productURL}`);
    }
    if (!domainCode) {
      console.warn(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Could not extract domainCode from hostname: ${hostname} (URL: ${productURL})`);
    }
    
    return { asin, domainCode };
  } catch (error) {
    console.error(`[fetchAmazonProductInfoTool - extractAsinAndDomain] Error parsing URL '${productURL}':`, error);
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
      console.error(`[fetchAmazonProductInfoTool] Could not extract valid ASIN or domainCode from URL: ${productURL}. ASIN: ${asin}, Domain: ${domainCode}. Returning default info.`);
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
          `[fetchAmazonProductInfoTool] Apify API request failed for ASIN ${asin} (domain ${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}. Returning default info.`
        );
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
        };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems) || datasetItems.length === 0 || typeof datasetItems[0] !== 'object' || datasetItems[0] === null) {
        console.warn(`[fetchAmazonProductInfoTool] Apify returned no valid data for ASIN ${asin} (URL ${productURL}). Returning default info.`);
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
        };
      }

      const productData = datasetItems[0] as any;
      
      const productName = productData?.title || DEFAULT_PRODUCT_NAME;
      
      let productDescription = productData?.productDescription || "";
      if (Array.isArray(productData?.features) && productData.features.length > 0) {
        const featuresText = productData.features.join('. ');
        if (productDescription && productDescription.length < 20 && featuresText.length > productDescription.length) {
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

      if (!productDescription || productDescription.trim() === "") {
        productDescription = DEFAULT_DESCRIPTION;
      }
      
      const finalProductName = (typeof productName === 'string' ? productName.trim() : DEFAULT_PRODUCT_NAME).substring(0,200);
      const finalProductDescription = (typeof productDescription === 'string' ? productDescription.trim() : DEFAULT_DESCRIPTION).substring(0,1500);
      
      return {
        productName: finalProductName,
        productDescription: finalProductDescription,
      };

    } catch (error) {
      console.error(`[fetchAmazonProductInfoTool] Error calling Apify API or processing data for ASIN ${asin} (URL ${productURL}):`, error);
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
      };
    }
  }
);

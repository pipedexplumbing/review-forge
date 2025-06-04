
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
function extractAsinAndDomain(productURL: string, toolName: string): { asin: string | null; domainCode: string | null } {
  const trimmedProductURL = productURL.trim();
  console.log(`[${toolName} - extractAsinAndDomain] Processing URL: ${trimmedProductURL}`);
  let asin: string | null = null;
  let domainCode: string | null = null;

  try {
    const url = new URL(trimmedProductURL);
    const hostname = url.hostname;
    console.log(`[${toolName} - extractAsinAndDomain] Parsed hostname: ${hostname}`);

    // Attempt 1: Extract ASIN from query parameter "asin"
    const asinFromQuery = url.searchParams.get('asin');
    if (asinFromQuery) {
      console.log(`[${toolName} - extractAsinAndDomain] Found 'asin' in query params: '${asinFromQuery}'`);
      if (/^[A-Z0-9]{10}$/i.test(asinFromQuery)) {
        asin = asinFromQuery.toUpperCase();
        console.log(`[${toolName} - extractAsinAndDomain] Valid ASIN from query: ${asin}`);
      } else {
        console.warn(`[${toolName} - extractAsinAndDomain] Invalid ASIN format from query param '${asinFromQuery}' for URL: ${trimmedProductURL}`);
      }
    } else {
      console.log(`[${toolName} - extractAsinAndDomain] No 'asin' found in query params.`);
    }

    // Attempt 2: Extract ASIN from common path patterns if not found in query
    if (!asin) {
      console.log(`[${toolName} - extractAsinAndDomain] ASIN not found in query, trying path patterns.`);
      const pathPatterns = [
        /\/(?:dp|gp\/product|-|d)\/([A-Z0-9]{10})/i,
        /\/gp\/aw\/d\/([A-Z0-9]{10})/i
      ];
      for (const pattern of pathPatterns) {
        const match = url.pathname.match(pattern);
        if (match && match[1]) {
          const potentialAsin = match[1].toUpperCase();
           if (/^[A-Z0-9]{10}$/.test(potentialAsin)) { // Extra validation
            asin = potentialAsin;
            console.log(`[${toolName} - extractAsinAndDomain] ASIN from path pattern '${pattern.source}': ${asin}`);
            break;
          } else {
            console.warn(`[${toolName} - extractAsinAndDomain] Invalid ASIN format from path pattern '${pattern.source}': ${potentialAsin} for URL: ${trimmedProductURL}`);
          }
        }
      }
    }

    // Domain extraction
    const knownTLDs = ['com', 'co.uk', 'de', 'fr', 'es', 'it', 'co.jp', 'cn', 'in', 'com.br', 'com.mx', 'com.au', 'ca'];
    let matchedTld: string | undefined = undefined;

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
        console.log(`[${toolName} - extractAsinAndDomain] Initial domainCode: ${domainCode}`);
        if (domainCode === "uk") domainCode = "co.uk";
        if (domainCode === "jp") domainCode = "co.jp";
        console.log(`[${toolName} - extractAsinAndDomain] Normalized domainCode: ${domainCode}`);
    }


    if (!asin) {
      console.warn(`[${toolName} - extractAsinAndDomain] FINAL: Could not extract ASIN. URL: ${trimmedProductURL}`);
    }
    if (!domainCode) {
      console.warn(`[${toolName} - extractAsinAndDomain] FINAL: Could not extract domainCode. Hostname: ${hostname}, URL: ${trimmedProductURL}`);
    }
    
    console.log(`[${toolName} - extractAsinAndDomain] Returning: asin='${asin}', domainCode='${domainCode}'`);
    return { asin, domainCode };
  } catch (error) {
    console.error(`[${toolName} - extractAsinAndDomain] Error processing URL '${trimmedProductURL}':`, error);
    console.log(`[${toolName} - extractAsinAndDomain] Returning due to error: asin='null', domainCode='null'`);
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
    console.log(`[fetchAmazonProductInfoTool] Received URL: ${productURL}`);
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('[fetchAmazonProductInfoTool] APIFY_API_TOKEN environment variable is not set. Returning default info.');
      return {
        productName: DEFAULT_PRODUCT_NAME,
        productDescription: DEFAULT_DESCRIPTION,
      };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL, 'fetchAmazonProductInfoTool');

    if (!asin || !domainCode) {
      console.error(`[fetchAmazonProductInfoTool] Could not extract valid ASIN ('${asin}') or domainCode ('${domainCode}') from URL: ${productURL}. Returning default info.`);
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

    console.log(`[fetchAmazonProductInfoTool] Preparing to call Apify with ASIN: ${asin}, Domain: ${domainCode}, Input: ${JSON.stringify(actorInput)}`);

    try {
      console.log(`[fetchAmazonProductInfoTool] Calling Apify with ASIN: ${asin}, Domain: ${domainCode}`);
      const response = await fetch(apifyApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actorInput),
      });

      console.log(`[fetchAmazonProductInfoTool] Apify response status for ASIN ${asin}: ${response.status}`);
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
      console.log(`[fetchAmazonProductInfoTool] Apify response JSON for ASIN ${asin} (first 200 chars): ${JSON.stringify(datasetItems).substring(0,200)}`);


      if (!Array.isArray(datasetItems) || datasetItems.length === 0 || typeof datasetItems[0] !== 'object' || datasetItems[0] === null) {
        console.warn(`[fetchAmazonProductInfoTool] Apify returned no valid data for ASIN ${asin} (URL ${productURL}). Full Response: ${JSON.stringify(datasetItems)}. Returning default info.`);
        return {
          productName: DEFAULT_PRODUCT_NAME,
          productDescription: DEFAULT_DESCRIPTION,
        };
      }

      const productData = datasetItems[0] as any;
      console.log(`[fetchAmazonProductInfoTool] Received productData from Apify for ASIN ${asin}: ${JSON.stringify(productData).substring(0,200)}...`);
      
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
      
      console.log(`[fetchAmazonProductInfoTool] Successfully processed Apify data for ASIN ${asin}. Name: ${finalProductName.substring(0,50)}...`);
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


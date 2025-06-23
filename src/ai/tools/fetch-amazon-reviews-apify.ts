
'use server';
/**
 * @fileOverview AI Tool for fetching Amazon product reviews using the Apify API
 * with the axesso_data~amazon-reviews-scraper actor.
 *
 * - fetchAmazonReviewsApifyTool - An AI tool that calls an Apify actor to get product reviews and product title.
 * - FetchAmazonReviewsApifyInput - Input schema for the tool (Amazon product URL).
 * - FetchAmazonReviewsApifyOutput - Output schema for the tool (array of review texts and an optional product title).
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const FetchAmazonReviewsApifyInputSchema = z.object({
  productURL: z
    .string()
    .url()
    .describe('The full URL of the Amazon product page to fetch reviews for.'),
});
export type FetchAmazonReviewsApifyInput = z.infer<typeof FetchAmazonReviewsApifyInputSchema>;

const FetchAmazonReviewsApifyOutputSchema = z.object({
  reviews: z.array(z.string()).describe('An array of extracted review text snippets.'),
  productTitle: z.string().optional().describe('The product title extracted by Apify, if available.'),
});
export type FetchAmazonReviewsApifyOutput = z.infer<typeof FetchAmazonReviewsApifyOutputSchema>;

// Helper function to extract ASIN and domain code from Amazon URL
function extractAsinAndDomain(productURL: string, toolName: string): { asin: string | null; domainCode: string | null } {
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
    // Extract hostname with a simple regex if URL constructor fails
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
        if (domainCode === "uk") domainCode = "co.uk"; // Normalize
        if (domainCode === "jp") domainCode = "co.jp"; // Normalize
        console.log(`[${toolName}] Extracted domainCode: ${domainCode}`);
    }
  }

  if (!asin) {
    console.error(`[${toolName}] FINAL: Could not extract ASIN from URL: ${trimmedProductURL}`);
  }
  if (!domainCode) {
    console.error(`[${toolName}] FINAL: Could not extract domainCode from URL: ${trimmedProductURL}`);
  }

  console.log(`[${toolName}] Returning: asin='${asin}', domainCode='${domainCode}'`);
  return { asin, domainCode };
}


export const fetchAmazonReviewsApifyTool = ai.defineTool(
  {
    name: 'fetchAmazonReviewsApifyTool',
    description:
      'Fetches Amazon product reviews and product title using the Apify actor "axesso_data~amazon-reviews-scraper". Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonReviewsApifyInputSchema,
    outputSchema: FetchAmazonReviewsApifyOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonReviewsApifyOutput> => {
    const toolName = 'fetchAmazonReviewsApifyTool';
    console.log(`[${toolName}] Received URL: ${productURL}`);

    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error(`[${toolName}] APIFY_API_TOKEN environment variable is not set.`);
      throw new Error('APIFY_API_TOKEN environment variable is not set.');
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL, toolName);

    if (!asin || !domainCode) {
      console.error(`[${toolName}] Could not extract valid ASIN ('${asin}') or domain code ('${domainCode}') from URL: ${productURL}.`);
      throw new Error(`Could not extract valid ASIN or domain from URL: ${productURL}.`);
    }

    const actorId = 'axesso_data~amazon-reviews-scraper';
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
      input: [ 
        {
          asin: asin,
          domainCode: domainCode,
          maxPages: 1, 
          sortBy: "recent", 
        },
      ],
    };
    console.log(`[${toolName}] Calling Apify with ASIN: ${asin}, Domain: ${domainCode}`);

    const response = await fetch(apifyUrl, {
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

    if (!Array.isArray(datasetItems)) { 
      console.error(`[${toolName}] Apify returned data that is not an array for ASIN ${asin}.`);
      throw new Error(`Apify returned invalid data for product ASIN ${asin}.`);
    }
    
    if (datasetItems.length === 0) {
       console.log(`[${toolName}] Apify returned an empty array for ASIN ${asin}. This may be because no reviews were found.`);
    } else {
        console.log(`[${toolName}] Received ${datasetItems.length} items from Apify for ASIN ${asin}.`);
    }

    const extractedReviews: string[] = [];
    let extractedProductTitle: string | undefined = undefined;

    for (const item of datasetItems) {
      if (typeof item === 'object' && item !== null) {
        if (typeof (item as any).text === 'string' && (item as any).text.trim() !== '') {
          extractedReviews.push((item as any).text.trim());
        }
        if (!extractedProductTitle && typeof (item as any).productTitle === 'string' && (item as any).productTitle.trim() !== '') {
          extractedProductTitle = (item as any).productTitle.trim();
        }
      }
    }
    
    if (datasetItems.length > 0 && !extractedProductTitle) {
      console.warn(`[${toolName}] Apify returned review data but no product title for ASIN ${asin}.`);
      // This is not a fatal error, we can proceed without the title from this source.
    }
    
    console.log(`[${toolName}] Extracted ${extractedReviews.length} reviews. Product Title: '${extractedProductTitle ? extractedProductTitle.substring(0,50)+'...' : 'N/A'}'`);
    return { reviews: extractedReviews, productTitle: extractedProductTitle };

  }
);

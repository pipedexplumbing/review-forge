
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
      console.warn(`[fetchAmazonReviewsApifyTool - extractAsinAndDomain] Could not extract ASIN from URL (checked query 'asin' and common path patterns): ${productURL}`);
    }
    if (!domainCode) {
      console.warn(`[fetchAmazonReviewsApifyTool - extractAsinAndDomain] Could not extract domainCode from hostname: ${hostname} (URL: ${productURL})`);
    }
    
    return { asin, domainCode };
  } catch (error) {
    console.error(`[fetchAmazonReviewsApifyTool - extractAsinAndDomain] Error parsing URL '${productURL}':`, error);
    return { asin: null, domainCode: null };
  }
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
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('[fetchAmazonReviewsApifyTool] APIFY_API_TOKEN environment variable is not set. Returning empty reviews.');
      return { reviews: [], productTitle: undefined };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL);

    if (!asin || !domainCode) {
      console.error(`[fetchAmazonReviewsApifyTool] Could not extract valid ASIN or domain code from URL: ${productURL}. ASIN: ${asin}, Domain: ${domainCode}. Returning empty reviews.`);
      return { reviews: [], productTitle: undefined };
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

    try {
      const response = await fetch(apifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actorInput),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Could not read error body");
        console.error(
          `[fetchAmazonReviewsApifyTool] Apify API request failed for ASIN ${asin} (domain ${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}. Returning empty reviews.`
        );
        return { reviews: [], productTitle: undefined };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems)) {
        console.warn(`[fetchAmazonReviewsApifyTool] Apify returned no valid data array for ASIN ${asin} (URL ${productURL}). Returning empty reviews.`);
        return { reviews: [], productTitle: undefined };
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
      
      return { reviews: extractedReviews, productTitle: extractedProductTitle };

    } catch (error) {
      console.error(`[fetchAmazonReviewsApifyTool] Error calling Apify API or processing reviews for ASIN ${asin} (URL ${productURL}):`, error);
      return { reviews: [], productTitle: undefined }; 
    }
  }
);

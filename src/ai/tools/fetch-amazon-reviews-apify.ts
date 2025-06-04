
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


export const fetchAmazonReviewsApifyTool = ai.defineTool(
  {
    name: 'fetchAmazonReviewsApifyTool',
    description:
      'Fetches Amazon product reviews and product title using the Apify actor "axesso_data~amazon-reviews-scraper". Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonReviewsApifyInputSchema,
    outputSchema: FetchAmazonReviewsApifyOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonReviewsApifyOutput> => {
    console.log(`[fetchAmazonReviewsApifyTool] Received URL: ${productURL}`);
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('[fetchAmazonReviewsApifyTool] APIFY_API_TOKEN environment variable is not set. Returning empty reviews.');
      return { reviews: [], productTitle: undefined };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL, 'fetchAmazonReviewsApifyTool');

    if (!asin || !domainCode) {
      console.error(`[fetchAmazonReviewsApifyTool] Could not extract valid ASIN ('${asin}') or domain code ('${domainCode}') from URL: ${productURL}. Returning empty reviews.`);
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
    console.log(`[fetchAmazonReviewsApifyTool] Preparing to call Apify with ASIN: ${asin}, Domain: ${domainCode}, Input: ${JSON.stringify(actorInput)}`);

    try {
      console.log(`[fetchAmazonReviewsApifyTool] Calling Apify with ASIN: ${asin}, Domain: ${domainCode}`);
      const response = await fetch(apifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actorInput),
      });

      console.log(`[fetchAmazonReviewsApifyTool] Apify response status for ASIN ${asin}: ${response.status}`);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Could not read error body");
        console.error(
          `[fetchAmazonReviewsApifyTool] Apify API request failed for ASIN ${asin} (domain ${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}. Returning empty reviews.`
        );
        return { reviews: [], productTitle: undefined };
      }

      const datasetItems: unknown = await response.json();
      console.log(`[fetchAmazonReviewsApifyTool] Apify response JSON for ASIN ${asin} (first 200 chars): ${JSON.stringify(datasetItems).substring(0,200)}`);


      if (!Array.isArray(datasetItems)) { 
        console.warn(`[fetchAmazonReviewsApifyTool] Apify returned data that is not an array for ASIN ${asin} (URL ${productURL}). Full Response: ${JSON.stringify(datasetItems)}. Returning empty reviews.`);
        return { reviews: [], productTitle: undefined };
      }
      
      if (datasetItems.length === 0) {
         console.log(`[fetchAmazonReviewsApifyTool] Apify returned an empty array for ASIN ${asin} (URL ${productURL}). This means no reviews were found by the actor, or the actor run failed silently for this input.`);
      } else {
        console.log(`[fetchAmazonReviewsApifyTool] Received ${datasetItems.length} items from Apify for ASIN ${asin}. First item: ${JSON.stringify(datasetItems[0]).substring(0,100)}...`);
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
      
      console.log(`[fetchAmazonReviewsApifyTool] Extracted ${extractedReviews.length} reviews. Product Title: '${extractedProductTitle ? extractedProductTitle.substring(0,50)+'...' : undefined}'`);
      return { reviews: extractedReviews, productTitle: extractedProductTitle };

    } catch (error) {
      console.error(`[fetchAmazonReviewsApifyTool] Error calling Apify API or processing reviews for ASIN ${asin} (URL ${productURL}):`, error);
      return { reviews: [], productTitle: undefined }; 
    }
  }
);


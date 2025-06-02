
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
    const hostname = url.hostname; // e.g., www.amazon.com, www.amazon.co.uk

    // Extract ASIN (typically 10 alphanumeric characters)
    // Common patterns: /dp/ASIN, /gp/product/ASIN, /-/ASIN
    const asinMatch = productURL.match(/\/(?:dp|gp\/product|-)\/([A-Z0-9]{10})/);
    const asin = asinMatch ? asinMatch[1] : null;

    // Extract domain code
    let domainCode: string | null = null;
    if (hostname.includes('amazon.')) {
      const parts = hostname.split('amazon.');
      if (parts.length > 1) {
        domainCode = parts[1];
        if (domainCode.startsWith('www.')) { 
            domainCode = domainCode.substring(4);
        }
        // Handle cases like com.br, com.mx - the actor expects just "br", "mx" after "com."
        // And co.uk, co.jp etc. the actor expects just "co.uk", "co.jp"
        // This logic seems to be what axesso_data~amazon-reviews-scraper expects for domainCode
        // e.g. "com" for amazon.com, "de" for amazon.de, "co.uk" for amazon.co.uk
        if (domainCode.includes('/')) { // remove any path
            domainCode = domainCode.split('/')[0];
        }
      }
    }
    
    return { asin, domainCode };
  } catch (error) {
    console.error('Error parsing Amazon URL:', error);
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
      console.error('APIFY_API_TOKEN environment variable is not set.');
      return { reviews: [], productTitle: undefined };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL);

    if (!asin || !domainCode) {
      console.error(`Could not extract ASIN or domain code from URL: ${productURL}`);
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

    // console.log(`Calling Apify actor ${actorId} with input:`, JSON.stringify(actorInput, null, 2));

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
          `Apify API request failed for ASIN ${asin} (${domainCode}) on URL ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}`
        );
        return { reviews: [], productTitle: undefined };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems)) {
        console.error(`Apify API response for ASIN ${asin} is not an array of dataset items:`, datasetItems);
        return { reviews: [], productTitle: undefined };
      }

      const extractedReviews: string[] = [];
      let extractedProductTitle: string | undefined = undefined;

      for (const item of datasetItems) {
        if (typeof item === 'object' && item !== null) {
          if (typeof (item as any).text === 'string' && (item as any).text.trim() !== '') {
            extractedReviews.push((item as any).text.trim());
          }
          // Attempt to get productTitle from the first item, assuming it's consistent
          if (!extractedProductTitle && typeof (item as any).productTitle === 'string') {
            extractedProductTitle = (item as any).productTitle.trim();
          }
        }
      }
      
      // console.log(`Fetched ${extractedReviews.length} reviews and title "${extractedProductTitle || 'N/A'}" from Apify for ASIN ${asin} (${productURL})`);
      return { reviews: extractedReviews, productTitle: extractedProductTitle };

    } catch (error) {
      console.error(`Error calling Apify API or processing reviews for ASIN ${asin} (${productURL}):`, error);
      return { reviews: [], productTitle: undefined }; 
    }
  }
);

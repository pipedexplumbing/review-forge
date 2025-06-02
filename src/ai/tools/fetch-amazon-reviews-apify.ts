
'use server';
/**
 * @fileOverview AI Tool for fetching Amazon product reviews using the Apify API
 * with the axesso_data~amazon-reviews-scraper actor.
 *
 * - fetchAmazonReviewsApifyTool - An AI tool that calls an Apify actor to get product reviews.
 * - FetchAmazonReviewsApifyInput - Input schema for the tool (Amazon product URL).
 * - FetchAmazonReviewsApifyOutput - Output schema for the tool (array of review texts).
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
});
export type FetchAmazonReviewsApifyOutput = z.infer<typeof FetchAmazonReviewsApifyOutputSchema>;

// Helper function to extract ASIN and domain code from Amazon URL
function extractAsinAndDomain(productURL: string): { asin: string | null; domainCode: string | null } {
  try {
    const url = new URL(productURL);
    const hostname = url.hostname; // e.g., www.amazon.com, www.amazon.co.uk

    // Extract ASIN (typically 10 alphanumeric characters)
    // Common patterns: /dp/ASIN, /gp/product/ASIN
    const asinMatch = productURL.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    const asin = asinMatch ? asinMatch[1] : null;

    // Extract domain code
    let domainCode: string | null = null;
    if (hostname.includes('amazon.')) {
      const parts = hostname.split('amazon.');
      if (parts.length > 1) {
        // e.g., "com", "co.uk", "de"
        domainCode = parts[1];
        if (domainCode.startsWith('www.')) { // Should not happen with parts[1] but good to check
            domainCode = domainCode.substring(4);
        }
         // Handle cases like com.br, com.mx - the actor expects just "br", "mx" after "com."
        if (domainCode.startsWith('com.')) {
            domainCode = domainCode.substring(4);
        }
      }
    }
    // If it's something like amazon.com, parts[1] will be 'com'.
    // If amazon.co.uk, parts[1] will be 'co.uk'.
    // The actor docs specify "com" for amazon.com, "de" for amazon.de.
    // "co.uk" for amazon.co.uk seems standard for Apify actors if they need TLD.
    // Let's assume the actor expects the full TLD part like "com", "co.uk", "de".

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
      'Fetches Amazon product reviews using the Apify actor "axesso_data~amazon-reviews-scraper". Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonReviewsApifyInputSchema,
    outputSchema: FetchAmazonReviewsApifyOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonReviewsApifyOutput> => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('APIFY_API_TOKEN environment variable is not set.');
      return { reviews: [] };
    }

    const { asin, domainCode } = extractAsinAndDomain(productURL);

    if (!asin || !domainCode) {
      console.error(`Could not extract ASIN or domain code from URL: ${productURL}`);
      return { reviews: [] };
    }

    const actorId = 'axesso_data~amazon-reviews-scraper';
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
      input: [ // Actor expects an array called "input"
        {
          asin: asin,
          domainCode: domainCode,
          maxPages: 1, // Fetch reviews from the first page
          sortBy: "recent", // Options: "recent", "helpful"
          // Other optional parameters from docs: filterByStar, filterByKeyword, reviewerType, etc.
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
        return { reviews: [] };
      }

      // The run-sync-get-dataset-items endpoint directly returns the array of dataset items.
      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems)) {
        console.error(`Apify API response for ASIN ${asin} is not an array of dataset items:`, datasetItems);
        return { reviews: [] };
      }

      const extractedReviews: string[] = [];
      for (const item of datasetItems) {
        // Based on the provided output documentation, the review text is in the "text" field.
        if (typeof item === 'object' && item !== null && typeof (item as any).text === 'string') {
          const reviewText = (item as any).text;
          if (reviewText.trim() !== '') {
            extractedReviews.push(reviewText.trim());
          }
        }
      }
      
      // console.log(`Fetched ${extractedReviews.length} reviews from Apify for ASIN ${asin} (${productURL})`);
      return { reviews: extractedReviews };

    } catch (error) {
      console.error(`Error calling Apify API or processing reviews for ASIN ${asin} (${productURL}):`, error);
      return { reviews: [] }; 
    }
  }
);


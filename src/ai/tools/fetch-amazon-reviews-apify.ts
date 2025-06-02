
'use server';
/**
 * @fileOverview AI Tool for fetching Amazon product reviews using the Apify API.
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

export const fetchAmazonReviewsApifyTool = ai.defineTool(
  {
    name: 'fetchAmazonReviewsApifyTool',
    description:
      'Fetches Amazon product reviews using a specified Apify actor. Requires an APIFY_API_TOKEN environment variable.',
    inputSchema: FetchAmazonReviewsApifyInputSchema,
    outputSchema: FetchAmazonReviewsApifyOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonReviewsApifyOutput> => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      console.error('APIFY_API_TOKEN environment variable is not set.');
      // Return empty reviews or throw, depending on desired strictness
      // For now, let's allow the flow to continue without reviews if token is missing.
      return { reviews: [] };
    }

    const actorId = 'axesso_data~amazon-reviews-scraper'; // As specified by the user
    const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`;

    const actorInput = {
      directUrls: [productURL],
      maxReviews: 5, // Fetch up to 5 reviews
      // Add any other necessary parameters for the "axesso_data~amazon-reviews-scraper" actor here
      // For example: language, country, etc.
      // These depend on the specific actor's input schema.
      // "scrapeReviewerName": false,
      // "scrapeReviewerUrl": false,
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
          `Apify API request failed for ${productURL}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0, 500)}`
        );
        return { reviews: [] };
      }

      const datasetItems: unknown = await response.json();

      if (!Array.isArray(datasetItems)) {
        console.error('Apify API response is not an array of dataset items:', datasetItems);
        return { reviews: [] };
      }

      const extractedReviews: string[] = [];
      for (const item of datasetItems) {
        if (typeof item === 'object' && item !== null) {
          // Try common keys for review text. This might need adjustment based on the actor's exact output.
          const reviewText = (item as any).review_text || (item as any).text || (item as any).reviewText || (item as any).body || (item as any).content;
          if (typeof reviewText === 'string' && reviewText.trim() !== '') {
            extractedReviews.push(reviewText.trim());
          }
        }
      }
      
      // console.log(`Fetched ${extractedReviews.length} reviews from Apify for ${productURL}`);
      return { reviews: extractedReviews };

    } catch (error) {
      console.error(`Error calling Apify API or processing reviews for ${productURL}:`, error);
      return { reviews: [] }; // Return empty on error
    }
  }
);

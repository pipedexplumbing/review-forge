
import { config } from 'dotenv';
config();

import '@/ai/flows/compose-review.ts';
import { fetchAmazonReviewsApifyTool, type FetchAmazonReviewsApifyInput } from '@/ai/tools/fetch-amazon-reviews-apify';

// --- Test function for Apify Amazon Reviews Tool ---
async function testApifyAmazonReviews() {
  console.log("--- Running Apify Amazon Reviews Tool Test ---");
  // You can change this URL to any Amazon product page for testing
  const testProductURL = "https://www.amazon.com/dp/B086DR2S82"; // Example: A popular Echo Dot

  const input: FetchAmazonReviewsApifyInput = { productURL: testProductURL };

  try {
    const output = await fetchAmazonReviewsApifyTool(input);
    if (output.reviews.length > 0) {
      console.log(`Successfully fetched ${output.reviews.length} reviews from Apify for ${testProductURL}:`);
      output.reviews.forEach((review, index) => {
        console.log(`Review ${index + 1}: ${review.substring(0, 100)}...`); // Log first 100 chars
      });
    } else {
      console.log(`Apify tool returned successfully, but no reviews were found for ${testProductURL}. This might be normal for some products or actor configurations.`);
    }
  } catch (error) {
    console.error(`Error testing Apify Amazon Reviews Tool for ${testProductURL}:`, error);
  }
  console.log("--- Apify Amazon Reviews Tool Test Finished ---");
}

// Run the test when the Genkit dev server starts
// You might want to comment this out after testing to avoid running it every time.
testApifyAmazonReviews();

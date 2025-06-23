
import { config } from 'dotenv';
config();

import '@/ai/flows/compose-review.ts';
import { fetchAmazonReviewsApifyTool, type FetchAmazonReviewsApifyInput } from '@/ai/tools/fetch-amazon-reviews-apify';

// --- Test function for Apify Amazon Reviews Tool ---
async function testApifyAmazonReviews() {
  console.log("--- Running Apify Amazon Reviews Tool Test (axesso_data~amazon-reviews-scraper) ---");
  // You can change this URL to any Amazon product page for testing
  // Examples:
  const testProductURL_US = "https://www.amazon.com/dp/B086DR2S82"; // Echo Dot (US)
  const testProductURL_UK = "https://www.amazon.co.uk/dp/B08C7KG5LP"; // Another Echo Dot (UK)
  const testProductURL_DE = "https://www.amazon.de/dp/B084DWG2VQ"; // Echo Dot (DE)

  const urlsToTest = [testProductURL_US, testProductURL_UK, testProductURL_DE];
  const testUrl = urlsToTest[0]; // Change index to test different URLs

  console.log(`Testing with URL: ${testUrl}`);

  const input: FetchAmazonReviewsApifyInput = { productURL: testUrl };

  try {
    const output = await fetchAmazonReviewsApifyTool(input);
    if (output.reviews.length > 0) {
      console.log(`Successfully fetched ${output.reviews.length} reviews from Apify for ${testUrl}:`);
      output.reviews.forEach((review, index) => {
        console.log(`Review ${index + 1}: ${review.substring(0, 150)}...`); // Log first 150 chars
      });
    } else {
      console.log(`Apify tool returned successfully, but no reviews were found for ${testUrl}. This might be normal, or an issue with ASIN/domain extraction, or the actor found no reviews based on criteria.`);
    }
  } catch (error) {
    console.error(`Error testing Apify Amazon Reviews Tool for ${testUrl}:`, error);
  }
  console.log("--- Apify Amazon Reviews Tool Test Finished ---");
}

// To run the test, you can uncomment the line below and restart the Genkit dev server.
// testApifyAmazonReviews();

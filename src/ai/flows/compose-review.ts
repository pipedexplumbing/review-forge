
// src/ai/flows/compose-review.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for composing product reviews.
 * It takes an Amazon product link and optional user feedback.
 * Product details (name, description, image) are fetched using an Apify Product Details AI tool.
 * Product reviews and title are fetched using an Apify Reviews AI tool.
 *
 * - composeReview - A function that composes a product review.
 * - ComposeReviewInput - The input type for the composeReview function.
 * - ComposeReviewOutput - The return type for the composeReview function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { fetchAmazonProductInfoTool, type FetchAmazonProductInfoOutput } from '@/ai/tools/fetch-amazon-product-info';
import { fetchAmazonReviewsApifyTool, type FetchAmazonReviewsApifyOutput } from '@/ai/tools/fetch-amazon-reviews-apify';

const ComposeReviewInputSchema = z.object({
  amazonLink: z.string().url().describe('The Amazon product link.'),
  starRating: z.number().min(1).max(5).optional().describe('The star rating given by the user (1-5), if provided.'),
  feedbackText: z.string().optional().describe('The user feedback text about the product, if provided.'),
  skipReviews: z.boolean().optional().describe('Whether to skip fetching existing customer reviews.'),
});

export type ComposeReviewInput = z.infer<typeof ComposeReviewInputSchema>;

const ComposeReviewOutputSchema = z.object({
  reviewText: z.string().describe('The composed product review text.'),
  reviewTitle: z.string().describe('The composed product review title.'),
  fetchedProductName: z.string().optional().describe('The product name fetched from Apify product details tool or reviews tool.'),
  fetchedProductImageURL: z.string().url().optional().describe('The product image URL fetched from Apify product details tool, if available.'),
});

export type ComposeReviewOutput = z.infer<typeof ComposeReviewOutputSchema>;

export async function composeReview(input: ComposeReviewInput): Promise<ComposeReviewOutput> {
  return composeReviewFlow(input);
}

// Internal schema for the prompt, after fetching product info and reviews
const ComposeReviewPromptInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productDescription: z.string().optional().describe('A description of the product.'),
  starRating: z.number().min(1).max(5).optional().describe('The star rating given by the user (1-5), if provided.'),
  feedbackText: z.string().optional().describe('The user feedback text about the product, if provided.'),
  customerReviewsText: z.string().optional().describe('A string containing snippets of existing customer reviews for the product, if available.')
});


const composeReviewPrompt = ai.definePrompt({
  name: 'composeReviewPrompt',
  input: {
    schema: ComposeReviewPromptInputSchema,
  },
  output: {
    schema: z.object({
      reviewTitle: z.string().describe('A concise and catchy title for the review, typically 5-15 words.'),
      reviewText: z.string().describe('The composed product review text, potentially including pros/cons and emojis. Length should be appropriate to user input.'),
    }),
  },
  prompt: `You are helping me write an Amazon product review. I need you to write the review TEXT in the first person, as if I am the one who bought and used the product.
Additionally, create a concise and catchy TITLE for this review. The title should be suitable for an Amazon review title field, generally between 5 to 15 words.
The goal is for me to be able to copy and paste both the title and the review text directly into Amazon's "Create Review" page.

CRITICAL INSTRUCTIONS:
- DO NOT make up personal scenarios (like "gift for brother", "my wife loved it", etc.) unless I specifically mentioned them
- DO NOT invent specific use cases or personal stories I didn't share
- You CAN and SHOULD use the product details and other customer reviews to write a helpful review
- If I provided feedback, incorporate it as the primary focus
- If I didn't provide feedback, base the review on the product details and what other customers are saying
- Keep personal pronouns general ("I" not "my brother/wife/friend") unless I mentioned specific people

Here is information about the product I supposedly used:
Product Name: {{{productName}}}
{{#if productDescription}}Product Description: {{{productDescription}}}{{/if}}

Regarding the product name: Use it for context, but avoid repeatedly stating "{{{productName}}}" in the review. Refer to it naturally, for example, as "this product," "the item," "it," or by its features, as a real person would. The goal is a genuine-sounding personal experience.

Here's my input, if I provided any:
{{#if starRating}}My Star Rating: {{{starRating}}} stars{{/if}}
{{#if feedbackText}}My Key Feedback: "{{{feedbackText}}}"{{/if}}

{{#if customerReviewsText}}
To help you, I've also looked at what other customers are saying. Here are some snippets from their reviews that you can consider for inspiration or to address common points:
--- Customer Review Snippets ---
{{{customerReviewsText}}}
--- End Customer Review Snippets ---
{{/if}}

Based on all this information (the product itself, my feedback, and what other customers said), please generate the review TITLE and TEXT.

Regarding review TEXT style:
- Write INFORMALLY, like you're texting a friend about the product
- Use SHORT, PUNCHY sentences - often just one line each
- PREFER line-by-line format over paragraphs
- Start casual and conversational (e.g., "Got this to replace my old one", "Picked this up on sale", "Finally upgraded to this")
- Include natural reactions (e.g., "Boy, does it work well", "I'm actually quite surprised", "Not what I expected")
- Add rhetorical questions when fitting (e.g., "Would I recommend it to a friend? 10/10 times")
- Keep it REAL - like an actual person would write, not a professional reviewer

Length and format:
- If user provided detailed feedback: Expand on their points but keep the informal, line-by-line style
- If minimal/no feedback: Keep it super brief - 3-5 lines total
- Instead of formal pros/cons lists, weave benefits/issues naturally into the text
- Or use simple one-line format like: "High quality, affordable price, time-efficient, and quiet."
- End simply with star rating or final verdict

Tone variations by rating:
- High ratings (4-5 stars): Enthusiastic but genuine ("Love it", "Worth every penny", "Game changer")
- Low ratings (1-2 stars): Disappointed but factual ("Not worth it", "Waste of money", "Back to the drawing board")
- Mid ratings (3 stars): Mixed feelings ("It's okay", "Does the job", "Nothing special")

Please ensure the review TEXT:
- Sounds like a real person, not a bot
- Uses natural line breaks for readability
- Feels spontaneous and genuine

Your entire response MUST be a single JSON object with two keys: "reviewTitle" and "reviewText". For example:
{
  "reviewTitle": "Exceeded expectations!",
  "reviewText": "Got this to replace my last one. Boy, does it work well. I'm actually quite surprised given the price and being off-brand.\\n\\nWould I recommend it to a friend? 10/10 times.\\n\\nHigh quality, affordable price, time-efficient, and quiet.\\n\\n5 stars."
}
Do not include any other text, explanations, or markdown formatting like \`\`\`json before or after this JSON object.
`,
});

const composeReviewFlow = ai.defineFlow(
  {
    name: 'composeReviewFlow',
    inputSchema: ComposeReviewInputSchema,
    outputSchema: ComposeReviewOutputSchema,
  },
  async (input: ComposeReviewInput) => {
    console.log('[composeReviewFlow] Starting flow with input:', input);
    let fetchedProductInfo: FetchAmazonProductInfoOutput | null = null;
    let fetchedApifyReviewsData: FetchAmazonReviewsApifyOutput | null = null;

    try {
      console.log('[composeReviewFlow] Fetching data for URL:', input.amazonLink);
      console.log('[composeReviewFlow] Skip reviews option:', input.skipReviews);
      
      if (input.skipReviews) {
        // Only fetch product info
        fetchedProductInfo = await fetchAmazonProductInfoTool({ productURL: input.amazonLink });
        fetchedApifyReviewsData = { reviews: [], productTitle: undefined };
        console.log('[composeReviewFlow] Product info fetched successfully, skipping reviews as requested.');
      } else {
        // Fetch both product info and reviews
        const results = await Promise.allSettled([
          fetchAmazonProductInfoTool({ productURL: input.amazonLink }),
          fetchAmazonReviewsApifyTool({ productURL: input.amazonLink })
        ]);
        
        // Product info is required
        if (results[0].status === 'rejected') {
          console.error('[composeReviewFlow] Product info tool failed:', results[0].reason);
          throw results[0].reason;
        }
        fetchedProductInfo = results[0].value;
        
        // Reviews are optional - if they fail, we continue without them
        if (results[1].status === 'fulfilled') {
          fetchedApifyReviewsData = results[1].value;
          console.log('[composeReviewFlow] Reviews data fetched successfully.');
        } else {
          console.warn('[composeReviewFlow] Reviews tool failed, continuing without reviews:', results[1].reason);
          fetchedApifyReviewsData = { reviews: [], productTitle: undefined };
        }
        console.log('[composeReviewFlow] Product info fetched successfully, proceeding with review generation.');
      }
    
    } catch (error: any) {
        console.error('[composeReviewFlow] CRITICAL: A data-fetching tool failed. Aborting flow.', error);
        // Re-throw a user-friendly error to be displayed in the UI.
        const errorMessage = error.message || "An unknown error occurred during data fetching.";
        
        // Provide more specific error messages
        if (errorMessage.includes('Could not extract a valid ASIN')) {
          throw new Error(`Unable to extract product information from this URL. Please use a direct Amazon product page link (e.g., https://www.amazon.com/dp/B0XXXXXXXXX). The app currently supports standard product pages, not special Amazon pages like Buy Again, Mobile Missions, or Review pages.`);
        } else if (errorMessage.includes('APIFY_API_TOKEN')) {
          throw new Error(`API configuration missing. Please ensure the APIFY_API_TOKEN environment variable is set.`);
        }
        
        throw new Error(`Could not fetch product details from the provided Amazon link. Reason: ${errorMessage}. Please ensure the link is a valid, public product page and try again.`);
    }

    // Since the tools will now throw an error if they fail, we can be confident we have the data here.
    // We prioritize the product name from the more detailed product info tool.
    const finalProductName = fetchedProductInfo.productName || fetchedApifyReviewsData.productTitle || 'Unknown Product';
    const finalProductDescription = fetchedProductInfo.productDescription;
    const finalProductImageURL = fetchedProductInfo.productImageURL;

    const customerReviewsText = fetchedApifyReviewsData.reviews.length > 0 
        ? fetchedApifyReviewsData.reviews.slice(0, 10).map(review => `- ${review.substring(0, 300)}${review.length > 300 ? '...' : ''}`).join('\\n')
        : undefined;

    const promptInput: z.infer<typeof ComposeReviewPromptInputSchema> = {
      productName: finalProductName,
      productDescription: finalProductDescription,
      starRating: input.starRating,
      feedbackText: input.feedbackText,
      customerReviewsText: customerReviewsText,
    };
    
    console.log('[composeReviewFlow] AI is receiving the following data:');
    console.log('- Product Name:', promptInput.productName);
    console.log('- Product Description:', promptInput.productDescription ? `${promptInput.productDescription.substring(0, 100)}...` : 'None');
    console.log('- Star Rating:', promptInput.starRating || 'Not provided');
    console.log('- User Feedback:', promptInput.feedbackText || 'Not provided');
    console.log('- Customer Reviews:', promptInput.customerReviewsText ? `${fetchedApifyReviewsData.reviews.length} reviews included` : 'None');
    console.log('- Product Image URL:', finalProductImageURL || 'None');
    const {output: promptOutput} = await composeReviewPrompt(promptInput);
    
    if (!promptOutput || !promptOutput.reviewText || !promptOutput.reviewTitle) {
        console.error('[composeReviewFlow] Prompt output is invalid:', promptOutput);
        throw new Error("Failed to generate review text and title from prompt. Output might be missing expected fields.");
    }

    console.log('[composeReviewFlow] Successfully generated review. Returning output.');
    return {
      reviewTitle: promptOutput.reviewTitle,
      reviewText: promptOutput.reviewText,
      fetchedProductName: finalProductName,
      fetchedProductImageURL: finalProductImageURL,
    };
  }
);

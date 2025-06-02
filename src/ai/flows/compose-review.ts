
// src/ai/flows/compose-review.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for composing product reviews.
 * It takes an Amazon product link and optional user feedback.
 * Product details are fetched using an AI tool (web scraper).
 * Product reviews are fetched using an Apify AI tool.
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
});

export type ComposeReviewInput = z.infer<typeof ComposeReviewInputSchema>;

const ComposeReviewOutputSchema = z.object({
  reviewText: z.string().describe('The composed product review text.'),
  fetchedProductName: z.string().optional().describe('The product name fetched from the Amazon link.'),
  fetchedProductImageURL: z.string().url().optional().describe('The product image URL fetched from the Amazon link.'),
});

export type ComposeReviewOutput = z.infer<typeof ComposeReviewOutputSchema>;

export async function composeReview(input: ComposeReviewInput): Promise<ComposeReviewOutput> {
  return composeReviewFlow(input);
}

// Internal schema for the prompt, after fetching product info and reviews
const ComposeReviewPromptInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productDescription: z.string().describe('A description of the product.'),
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
    schema: z.object({ reviewText: z.string().describe('The composed product review text.') }),
  },
  prompt: `You are an expert product reviewer. Compose a compelling and helpful product review for:
Product Name: {{{productName}}}
Product Description: {{{productDescription}}}

Incorporate the following user input if provided:
{{#if starRating}}Star Rating: {{{starRating}}} stars{{/if}}
{{#if feedbackText}}User Feedback: {{{feedbackText}}}{{/if}}

{{#if customerReviewsText}}
Also, consider these existing customer reviews when crafting your response. You can incorporate snippets or sentiments from them:
--- Customer Reviews Snippets ---
{{{customerReviewsText}}}
--- End Customer Reviews Snippets ---
{{/if}}

Consider the product description, user feedback, and existing customer reviews (if any) to create a balanced review.
If star rating is high (4-5), focus on positives. If low (1-2), focus on negatives. If mid-range (3) or no rating, provide a balanced view.
If no user feedback is provided, generate a general review based on the product name, description, and existing reviews (if any).
If a star rating is provided but no feedback text, infer general sentiment from the rating.
Compose the review in varied writing styles, optionally using a pros/cons structure.
The review should be well-formatted and ready for submission.
If minimal information is provided (only product name and description, no customer reviews), create a general positive and engaging review.
`,
});

const composeReviewFlow = ai.defineFlow(
  {
    name: 'composeReviewFlow',
    inputSchema: ComposeReviewInputSchema,
    outputSchema: ComposeReviewOutputSchema,
  },
  async (input: ComposeReviewInput) => {
    let fetchedProductInfo: FetchAmazonProductInfoOutput = {
        productName: "Unknown Product",
        productDescription: "No description available.",
        productImageURL: undefined,
    };
    let fetchedCustomerReviews: FetchAmazonReviewsApifyOutput = {
        reviews: []
    };

    try {
      // Fetch product info and reviews in parallel if desired, or sequentially
      // For simplicity, let's do it sequentially first.
      fetchedProductInfo = await fetchAmazonProductInfoTool({ productURL: input.amazonLink });
    } catch (toolError) {
      console.warn('Failed to fetch product info with tool:', toolError);
      // Proceed with default/minimal product info
    }

    try {
        fetchedCustomerReviews = await fetchAmazonReviewsApifyTool({ productURL: input.amazonLink });
    } catch (toolError) {
        console.warn('Failed to fetch customer reviews with Apify tool:', toolError);
        // Proceed without customer reviews
    }
    
    const customerReviewsText = fetchedCustomerReviews.reviews.length > 0 
        ? fetchedCustomerReviews.reviews.map(review => `- ${review}`).join('\\n') // Format as a list
        : undefined;

    const promptInput: z.infer<typeof ComposeReviewPromptInputSchema> = {
      productName: fetchedProductInfo.productName,
      productDescription: fetchedProductInfo.productDescription,
      starRating: input.starRating,
      feedbackText: input.feedbackText,
      customerReviewsText: customerReviewsText,
    };

    const {output: promptOutput} = await composeReviewPrompt(promptInput);
    
    if (!promptOutput) {
        throw new Error("Failed to generate review text from prompt.");
    }

    return {
      reviewText: promptOutput.reviewText,
      fetchedProductName: fetchedProductInfo.productName,
      fetchedProductImageURL: fetchedProductInfo.productImageURL,
    };
  }
);

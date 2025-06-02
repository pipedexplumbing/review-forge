
// src/ai/flows/compose-review.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for composing product reviews.
 * It takes an Amazon product link and optional user feedback to generate a review.
 * Product details are fetched using an AI tool.
 *
 * - composeReview - A function that composes a product review.
 * - ComposeReviewInput - The input type for the composeReview function.
 * - ComposeReviewOutput - The return type for the composeReview function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { fetchAmazonProductInfoTool, type FetchAmazonProductInfoOutput } from '@/ai/tools/fetch-amazon-product-info';

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

// Internal schema for the prompt, after fetching product info
const ComposeReviewPromptInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productDescription: z.string().describe('A description of the product.'),
  starRating: z.number().min(1).max(5).optional().describe('The star rating given by the user (1-5), if provided.'),
  feedbackText: z.string().optional().describe('The user feedback text about the product, if provided.'),
});


const composeReviewPrompt = ai.definePrompt({
  name: 'composeReviewPrompt',
  input: {
    schema: ComposeReviewPromptInputSchema,
  },
  output: { // The prompt itself only needs to output reviewText
    schema: z.object({ reviewText: z.string().describe('The composed product review text.') }),
  },
  prompt: `You are an expert product reviewer. Compose a compelling and helpful product review for:
Product Name: {{{productName}}}
Product Description: {{{productDescription}}}

Incorporate the following user input if provided:
{{#if starRating}}Star Rating: {{{starRating}}} stars{{/if}}
{{#if feedbackText}}User Feedback: {{{feedbackText}}}{{/if}}

Consider the product description and user feedback to create a balanced review.
If star rating is high (4-5), focus on positives. If low (1-2), focus on negatives. If mid-range (3) or no rating, provide a balanced view.
If no user feedback is provided, generate a general review based on the product name and description.
If a star rating is provided but no feedback text, infer general sentiment from the rating.
Compose the review in varied writing styles, optionally using a pros/cons structure.
The review should be well-formatted and ready for submission.
If minimal information is provided (only product name and description), create a general positive and engaging review.
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

    try {
      fetchedProductInfo = await fetchAmazonProductInfoTool({ productURL: input.amazonLink });
    } catch (toolError) {
      console.warn('Failed to fetch product info with tool:', toolError);
      // Proceed with default/minimal product info
    }
    
    const promptInput: z.infer<typeof ComposeReviewPromptInputSchema> = {
      productName: fetchedProductInfo.productName,
      productDescription: fetchedProductInfo.productDescription,
      starRating: input.starRating,
      feedbackText: input.feedbackText,
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

    
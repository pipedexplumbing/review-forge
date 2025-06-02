
// src/ai/flows/compose-review.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for composing product reviews.
 * It takes an Amazon product link and optional user feedback.
 * Product details are fetched using an Apify Product Details AI tool.
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
});

export type ComposeReviewInput = z.infer<typeof ComposeReviewInputSchema>;

const ComposeReviewOutputSchema = z.object({
  reviewText: z.string().describe('The composed product review text.'),
  fetchedProductName: z.string().optional().describe('The product name fetched from Apify product details tool or reviews tool.'),
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
  prompt: `You are helping me write an Amazon product review. I need you to write the review in the first person, as if I am the one who bought and used the product. The goal is for me to be able to copy and paste this review directly into Amazon's "Create Review" page.

Here is information about the product:
Product Name: {{{productName}}}
Product Description: {{{productDescription}}}

Here's my input, if I provided any:
{{#if starRating}}My Star Rating: {{{starRating}}} stars{{/if}}
{{#if feedbackText}}My Key Feedback: "{{{feedbackText}}}"{{/if}}

{{#if customerReviewsText}}
To help you, I've also looked at what other customers are saying. Here are some snippets from their reviews that you can consider for inspiration or to address common points:
--- Customer Review Snippets ---
{{{customerReviewsText}}}
--- End Customer Review Snippets ---
{{/if}}

Based on all this information (the product itself, my feedback, and what other customers said), please write a helpful, authentic-sounding, and engaging review.
It should sound like a real person sharing their genuine experience with the product.

- If I gave a high star rating (4-5 stars) or positive feedback, focus on what I liked and why. Be specific.
- If I gave a low star rating (1-2 stars) or negative feedback, clearly explain the issues I encountered and my disappointment.
- If my rating is mid-range (3 stars), or if I only provided feedback without a rating, provide a balanced perspective, highlighting both pros and cons.
- If I only gave a star rating and no text feedback, infer my general sentiment from that rating and elaborate on potential reasons based on the product description and other reviews.
- If I provided no feedback or rating at all, write a generally positive and informative review based on the product description and other customer reviews (if available). If there's very little info, create a concise, engaging, and generally positive review that someone might find helpful.

Please:
- Write entirely in the first person (e.g., "I found...", "For me...", "I was impressed by...").
- Make it sound natural and conversational. Avoid overly robotic or formulaic language.
- Ensure it's well-formatted for readability on Amazon (e.g., paragraphs, maybe bullet points for pros/cons if it feels natural for the specific review).
- Do not include any placeholders like "[Your Name]" or instructions for me to fill in. The review should be complete and ready to paste.
- The tone should match the star rating if provided. (e.g. enthusiastic for 5 stars, critical for 1 star).
`,
});

const GENERIC_PRODUCT_NAMES = [
    "Product (Details Fetching Failed)",
    "Unknown Product",
    "This Product",
];

const composeReviewFlow = ai.defineFlow(
  {
    name: 'composeReviewFlow',
    inputSchema: ComposeReviewInputSchema,
    outputSchema: ComposeReviewOutputSchema,
  },
  async (input: ComposeReviewInput) => {
    let fetchedProductInfo: FetchAmazonProductInfoOutput = {
        productName: "Product (Details Fetching Failed)",
        productDescription: "No description available.",
    };
    let fetchedApifyReviewsData: FetchAmazonReviewsApifyOutput = {
        reviews: [],
        productTitle: undefined,
    };

    try {
      fetchedProductInfo = await fetchAmazonProductInfoTool({ productURL: input.amazonLink });
    } catch (toolError) {
      console.warn('Failed to fetch product info with Apify product details tool:', toolError);
    }

    try {
        fetchedApifyReviewsData = await fetchAmazonReviewsApifyTool({ productURL: input.amazonLink });
    } catch (toolError) {
        console.warn('Failed to fetch customer reviews/title with Apify reviews tool:', toolError);
    }
    
    const customerReviewsText = fetchedApifyReviewsData.reviews.length > 0 
        ? fetchedApifyReviewsData.reviews.slice(0, 10).map(review => `- ${review.substring(0, 300)}${review.length > 300 ? '...' : ''}`).join('\\n')
        : undefined;

    let finalProductName = fetchedProductInfo.productName;

    if (GENERIC_PRODUCT_NAMES.includes(finalProductName) && fetchedApifyReviewsData.productTitle && fetchedApifyReviewsData.productTitle.trim() !== "") {
        finalProductName = fetchedApifyReviewsData.productTitle;
    }

    if (GENERIC_PRODUCT_NAMES.includes(finalProductName)) {
        finalProductName = "This Product";
    }


    const promptInput: z.infer<typeof ComposeReviewPromptInputSchema> = {
      productName: finalProductName,
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
      fetchedProductName: finalProductName,
    };
  }
);

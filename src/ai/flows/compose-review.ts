
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

Regarding review TEXT length and style:
- It should sound like a real person sharing their genuine experience with the product. Write *entirely* in the first person, using 'I', 'me', 'my'. Describe *my* supposed direct experience with the product.
- The length should be appropriate to the input I've given:
  - If I have provided detailed feedback in "{{{feedbackText}}}", then a more comprehensive review (e.g., 2-4 well-developed paragraphs) is appropriate to cover my points.
  - If my feedback is brief or absent, aim for a more concise review (e.g., 1-2 well-developed paragraphs, or even a few insightful sentences).
  - Prioritize quality and authenticity over sheer length.
- If it feels natural for the product and my feedback, consider including a 'Pros:' and 'Cons:' section. Use simple bullet points for easy copying (e.g., "- Pro: ...", "- Con: ...", or "* Pro: ...", "* Con: ..."). This section should be part of the overall review text.
- You can include one or two relevant emojis (e.g., 👍, 🤔, 🎉) if they fit the tone of the review, but don't overdo it. Place them naturally within the text.
- If I gave a high star rating (4-5 stars) or positive feedback, focus on what I liked and why. Be specific.
- If I gave a low star rating (1-2 stars) or negative feedback, clearly explain the issues I encountered and my disappointment.
- If my rating is mid-range (3 stars), or if I only provided feedback without a rating, provide a balanced perspective, highlighting both pros and cons if appropriate.
- If I only gave a star rating and no text feedback, infer my general sentiment from that rating and elaborate on potential reasons based on the product description and other reviews, keeping the length appropriate and concise (1-2 paragraphs typically).
- If I provided no feedback or rating at all, write a concise, engaging, and generally positive review (e.g., 1-2 paragraphs) based on the product description and other customer reviews (if available). If no other information is available, use your knowledge to create a plausible, general review for "{{{productName}}}".

Please ensure the review TEXT:
- Is well-formatted for readability on Amazon (e.g., distinct paragraphs, bullet points for pros/cons if used).
- Does not include any placeholders like "[Your Name]" or instructions for me to fill in.

Your entire response MUST be a single JSON object with two keys: "reviewTitle" and "reviewText". For example:
{
  "reviewTitle": "Excellent Product, Highly Recommend!",
  "reviewText": "I've been using this product for a week now and I'm very impressed... [additional paragraphs]...\\n\\nPros:\\n- Great battery life\\n- Easy to use\\n\\nCons:\\n- A bit bulky"
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

    // We will attempt to fetch from both sources. If one fails, we can still proceed if the other succeeds.
    try {
      fetchedApifyReviewsData = await fetchAmazonReviewsApifyTool({ productURL: input.amazonLink });
      console.log('[composeReviewFlow] Reviews data fetched successfully.');
    } catch (error) {
      console.warn('[composeReviewFlow] Failed to fetch customer reviews/title with Apify reviews tool:', error);
    }
    
    try {
      fetchedProductInfo = await fetchAmazonProductInfoTool({ productURL: input.amazonLink });
      console.log('[composeReviewFlow] Product info fetched successfully.');
    } catch (error) {
      console.warn('[composeReviewFlow] Failed to fetch product info with Apify product details tool:', error);
    }

    // Determine the final product name, preferring the reviews tool's title, then the details tool's title.
    const finalProductName = fetchedApifyReviewsData?.productTitle || fetchedProductInfo?.productName;
    const finalProductDescription = fetchedProductInfo?.productDescription;
    const finalProductImageURL = fetchedProductInfo?.productImageURL;
    
    // If BOTH tools failed to return a product name, then we cannot proceed.
    if (!finalProductName) {
        console.error('[composeReviewFlow] CRITICAL: Both Apify tools failed to retrieve a product name. Aborting.');
        throw new Error('Could not fetch product details from the provided Amazon link. Please ensure the link is a valid, public product page and try again.');
    }

    const customerReviewsText = (fetchedApifyReviewsData?.reviews?.length ?? 0) > 0 
        ? (fetchedApifyReviewsData?.reviews ?? []).slice(0, 10).map(review => `- ${review.substring(0, 300)}${review.length > 300 ? '...' : ''}`).join('\\n')
        : undefined;

    const promptInput: z.infer<typeof ComposeReviewPromptInputSchema> = {
      productName: finalProductName,
      productDescription: finalProductDescription,
      starRating: input.starRating,
      feedbackText: input.feedbackText,
      customerReviewsText: customerReviewsText,
    };
    
    console.log('[composeReviewFlow] Calling composeReviewPrompt with product:', promptInput.productName);
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

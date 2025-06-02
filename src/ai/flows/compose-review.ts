// src/ai/flows/compose-review.ts
'use server';

/**
 * @fileOverview This file defines a Genkit flow for composing product reviews from user feedback.
 *
 * - composeReview - A function that composes a product review based on user feedback, product details from an Amazon link, and existing customer reviews.
 * - ComposeReviewInput - The input type for the composeReview function.
 * - ComposeReviewOutput - The return type for the composeReview function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ComposeReviewInputSchema = z.object({
  starRating: z.number().min(1).max(5).describe('The star rating given by the user (1-5).'),
  feedbackText: z.string().describe('The user feedback text about the product.'),
  productDetails: z.string().describe('Product details scraped from the Amazon link.'),
  existingReviews: z.string().describe('Existing customer reviews scraped from the Amazon link.'),
});

export type ComposeReviewInput = z.infer<typeof ComposeReviewInputSchema>;

const ComposeReviewOutputSchema = z.object({
  reviewText: z.string().describe('The composed product review text.'),
});

export type ComposeReviewOutput = z.infer<typeof ComposeReviewOutputSchema>;

export async function composeReview(input: ComposeReviewInput): Promise<ComposeReviewOutput> {
  return composeReviewFlow(input);
}

const composeReviewPrompt = ai.definePrompt({
  name: 'composeReviewPrompt',
  input: {
    schema: ComposeReviewInputSchema,
  },
  output: {
    schema: ComposeReviewOutputSchema,
  },
  prompt: `You are an expert product reviewer. Compose a compelling and helpful product review based on the following information:

Star Rating: {{{starRating}}}
User Feedback: {{{feedbackText}}}
Product Details: {{{productDetails}}}
Existing Reviews: {{{existingReviews}}}

Compose the review in varied writing styles, optionally using a pros/cons structure. Incorporate snippets from existing customer reviews where appropriate. The review should be well-formatted and ready for submission.
`,
});

const composeReviewFlow = ai.defineFlow(
  {
    name: 'composeReviewFlow',
    inputSchema: ComposeReviewInputSchema,
    outputSchema: ComposeReviewOutputSchema,
  },
  async input => {
    const {output} = await composeReviewPrompt(input);
    return output!;
  }
);

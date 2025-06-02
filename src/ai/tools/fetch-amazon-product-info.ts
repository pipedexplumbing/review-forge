
'use server';
/**
 * @fileOverview AI Tool for fetching basic product information from an Amazon product link.
 *
 * - fetchAmazonProductInfoTool - An AI tool that attempts to extract product name, description, and image URL.
 * - FetchAmazonProductInfoInput - Input schema for the tool (Amazon product URL).
 * - FetchAmazonProductInfoOutput - Output schema for the tool (product name, description, image URL).
 *
 * IMPORTANT: This tool uses a MOCK implementation for fetching data due to the complexities
 * and restrictions of web scraping. It does not perform live scraping of Amazon.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const FetchAmazonProductInfoInputSchema = z.object({
  productURL: z
    .string()
    .url()
    .describe('The full URL of the Amazon product page.'),
});
export type FetchAmazonProductInfoInput = z.infer<typeof FetchAmazonProductInfoInputSchema>;

const FetchAmazonProductInfoOutputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productDescription: z
    .string()
    .describe('A brief description or key features of the product.'),
  productImageURL: z.string().url().optional().describe('A URL for the product image, if found.'),
});
export type FetchAmazonProductInfoOutput = z.infer<typeof FetchAmazonProductInfoOutputSchema>;

export const fetchAmazonProductInfoTool = ai.defineTool(
  {
    name: 'fetchAmazonProductInfoTool',
    description:
      'Fetches basic product information (name, description, image URL) from a given Amazon product page URL. Uses a mock implementation.',
    inputSchema: FetchAmazonProductInfoInputSchema,
    outputSchema: FetchAmazonProductInfoOutputSchema,
  },
  async ({ productURL }): Promise<FetchAmazonProductInfoOutput> => {
    // MOCK IMPLEMENTATION:
    // In a real-world scenario, this would involve robust web scraping or using a dedicated API.
    // Amazon has strong anti-scraping measures, making direct scraping unreliable and potentially problematic.
    // This mock will return placeholder data or attempt a very naive extraction from the URL.

    let productName = 'Amazing Product (Mock)';
    let productDescription =
      'This is a mock description. In a real app, this would be fetched from the Amazon page. This product likely has excellent features and benefits customers greatly.';
    let productImageURL: string | undefined = `https://placehold.co/300x200.png?text=Mock+Product`;
    
    try {
      const url = new URL(productURL);
      const pathParts = url.pathname.split('/');
      
      // Try to find ASIN or product title-like part in URL (common patterns /dp/ASIN or /product-name/dp/ASIN or /gp/product/ASIN)
      let potentialName = '';
      const dpIndex = pathParts.findIndex((part) => part === 'dp');
      
      if (dpIndex > 0 && pathParts.length -1 > dpIndex) { // Product name part is often before /dp/
        // Check if the part before 'dp' seems like a product title (not a language code like 'en' or short string)
        if (pathParts[dpIndex - 1] && pathParts[dpIndex - 1].length > 5 && !/^[a-z]{2}$/.test(pathParts[dpIndex - 1])) {
            potentialName = pathParts[dpIndex - 1];
        } else if (pathParts[dpIndex + 1] && pathParts[dpIndex + 1].length > 3) { // Or ASIN itself if no clear title part before.
            potentialName = pathParts[dpIndex + 1]; // Fallback to using ASIN as part of name if no clear slug.
        }
      } else {
         const productGpIndex = pathParts.findIndex((part) => part === 'product'); // Path like /gp/product/ASIN/ref...
         if (productGpIndex !== -1 && pathParts.length > productGpIndex + 1 && pathParts[productGpIndex+1].length > 3) {
            potentialName = pathParts[productGpIndex + 1]; // Often ASIN here, or sometimes a slug after gp/product/
             // If there's another part after ASIN that looks like a name slug (before ref)
            if (pathParts.length > productGpIndex + 2 && pathParts[productGpIndex + 2] !== 'ref' && pathParts[productGpIndex + 2].length > 5) {
                potentialName = pathParts[productGpIndex + 2];
            }
         }
      }

      if (potentialName && potentialName.length > 3 && potentialName !== 'dp' && potentialName !== 'product') { 
        // Basic check to avoid using 'dp' or 'product' as name
        productName = decodeURIComponent(potentialName.replace(/-/g, ' ')).substring(0, 70); // Decode, replace hyphens, limit length
        // Capitalize first letter of each word
        productName = productName.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');
      } else {
        // Fallback if no suitable name part is found
        const asinMatch = productURL.match(/\/([A-Z0-9]{10})(\/|\?|$)/);
        if (asinMatch && asinMatch[1]) {
            productName = `Product ASIN ${asinMatch[1]} (Mock)`;
        } else {
            productName = "Fetched Product (Mock Data)";
        }
      }
      
      productImageURL = `https://placehold.co/300x200.png?text=${encodeURIComponent(productName.substring(0,20))}`;
      productDescription = `(Mock Data) This fantastic product, '${productName}', found at the provided link, offers a range of useful features. It's designed for durability and user satisfaction.`;

    } catch (e) {
      console.warn('Error parsing URL for mock product name:', e);
      // Fallback to generic mock names if URL parsing fails
       productName = 'General Product (Mock)';
       productDescription = 'This is a generally described product (mock data) based on the provided link. It is expected to meet customer needs effectively.';
       productImageURL = `https://placehold.co/300x200.png?text=Product`;
    }

    return {
      productName,
      productDescription,
      productImageURL,
    };
  }
);

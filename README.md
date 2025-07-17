# Review Forge

AI-powered Amazon product review generator built with Next.js and Google Genkit.

## Features

- Generate authentic-sounding Amazon product reviews using AI
- Fetch real product information and existing reviews from Amazon
- Customize reviews with star ratings and personal feedback
- Beautiful UI with dark/light mode support

## Prerequisites

- Node.js 18+ 
- npm or yarn
- API Keys:
  - Google AI API key (for Genkit)
  - Apify API token (for Amazon data scraping)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd review-forge
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```bash
cp .env.example .env.local
```

4. Add your API keys to `.env.local`:
```
APIFY_API_TOKEN=your_apify_api_token_here
GOOGLE_AI_API_KEY=your_google_ai_api_key_here
PASSWORD=your_app_password_here
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:8080](http://localhost:8080) in your browser

## Getting API Keys

### Google AI API Key
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy and paste it into your `.env.local` file

### Apify API Token
1. Sign up at [Apify](https://apify.com)
2. Go to Settings > Integrations > API tokens
3. Create a new API token
4. Copy and paste it into your `.env.local` file

## Usage

1. Enter the password to access the app
2. Paste an Amazon product URL (must be a direct product page, e.g., `https://www.amazon.com/dp/B0XXXXXXXXX`)
3. Optionally add:
   - Star rating (1-5)
   - Personal feedback about the product
4. Click "Forge Review" to generate your AI-powered review
5. Copy the generated title and review text

## Supported URL Types

Currently supports standard Amazon product pages:
- ✅ `https://www.amazon.com/dp/ASIN`
- ✅ `https://www.amazon.com/gp/product/ASIN`
- ✅ Product URLs with ASIN in query parameters

Not yet supported:
- ❌ Buy Again pages
- ❌ Mobile mission pages
- ❌ Review pages
- ❌ Wishlist pages

## Troubleshooting

### "Could not extract product information" error
- Ensure you're using a direct product page URL
- Check that your Apify API token is valid and has credits
- Try a different product URL

### "API configuration missing" error
- Make sure you've created the `.env.local` file
- Verify your API keys are correctly set
- Restart the development server after adding environment variables

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run linting
- `npm run typecheck` - Run type checking

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui
- **AI**: Google Genkit, Gemini
- **Data Scraping**: Apify
- **Fonts**: Belleza, Alegreya (Google Fonts)

## License

[Your License Here]
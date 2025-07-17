# Review Forge

AI-powered Amazon product review generator built with Next.js and Google Genkit.

## Features

- Generate authentic-sounding Amazon product reviews using AI
- Fetch real product information and existing reviews from Amazon
- Customize reviews with star ratings and personal feedback
- Beautiful UI with dark/light mode support

## Prerequisites

- Node.js 18+ (tested with Node.js 20 and 23)
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

This will start the Next.js development server on port 3293 with explicit configuration for reliable local development.

6. Open [http://localhost:3293](http://localhost:3293) in your browser

### Alternative Development Commands

If you experience issues with the main dev command, try:

```bash
npm run dev:simple    # Standard Next.js dev server (port 3000)
npm run dev:debug     # With Node.js debugger enabled (port 3000)
```

## Server Configuration

The development server is configured with explicit settings to ensure reliable startup:

- **Port**: 3293 (configurable via `PORT` environment variable)
- **Hostname**: localhost (explicit binding for compatibility)
- **Environment**: development mode with full debugging

### Troubleshooting

If you encounter connection issues:

1. **Check port availability**: Ensure port 3293 is not in use by another application
2. **Try alternative ports**: Use `npm run dev:simple` for standard port 3000
3. **Node.js version**: Ensure you're using Node.js 18+
4. **Clear cache**: Run `rm -rf .next && npm run dev` to clear Next.js cache

### Production Deployment

The application is deployed on Vercel with the following configuration:

- **Environment Variables**: Set `GEMINI_API_KEY` and `APIFY_API_TOKEN` in Vercel dashboard
- **Build Command**: `npm run build`
- **Start Command**: `npm run start`
- **Node.js Version**: 20.x (specified in `package.json`)

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
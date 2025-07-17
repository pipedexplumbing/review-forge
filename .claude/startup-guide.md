# Review Forge Startup Guide

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Access application**:
   - Open http://localhost:3293
   - Login with password: `amazon`

## Detailed Setup

### Prerequisites

- Node.js 18+ (tested with 20 and 23)
- npm or yarn
- API keys from Google AI and Apify

### Environment Variables

Create `.env` file with:
```env
GEMINI_API_KEY=your_gemini_api_key_here
APIFY_API_TOKEN=your_apify_api_token_here
```

### Development Commands

```bash
# Primary development server (port 3293)
npm run dev

# Alternative servers
npm run dev:simple  # Standard Next.js (port 3000)
npm run dev:debug   # With debugger enabled

# Build commands
npm run build       # Production build
npm run start       # Production server
npm run lint        # ESLint
npm run typecheck   # TypeScript check
```

### Application Features

- **Authentication**: Password-protected access
- **AI Integration**: Gemini 2.5 Flash for review generation
- **Data Scraping**: Apify for Amazon product information
- **Review Customization**: Star ratings and personal feedback
- **Export**: Copy-to-clipboard functionality

### Troubleshooting

#### Server Won't Start
- Check port 3293 availability
- Clear Next.js cache: `rm -rf .next`
- Try alternative port: `npm run dev:simple`

#### Connection Refused
- Verify localhost resolution
- Check firewall settings
- Try explicit IP: http://127.0.0.1:3293

#### Build Errors
- Update dependencies: `npm install`
- Check Node.js version: `node -v`
- Clear all caches: `rm -rf .next node_modules/.cache`

### Production Deployment

#### Vercel (Recommended)
1. Connect GitHub repository
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

#### Manual Deployment
1. Build: `npm run build`
2. Start: `npm run start`
3. Ensure environment variables are set

### Security Notes

- Password authentication is hardcoded for demo purposes
- API keys are required for full functionality
- HTTPS recommended for production use
- Consider rate limiting for production deployments

## Architecture Overview

```
review-forge/
├── src/
│   ├── app/               # Next.js App Router
│   ├── components/        # UI components
│   ├── ai/               # Genkit AI flows
│   └── hooks/            # React hooks
├── public/               # Static assets
├── .env                  # Environment variables
└── package.json          # Dependencies and scripts
```

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the server configuration documentation
3. Check the CHANGELOG.md for recent changes
4. Verify all prerequisites are met
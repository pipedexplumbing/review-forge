# Server Configuration

## Development Server

The Review Forge application uses a carefully configured Next.js development server to ensure reliable startup across different environments.

### Current Configuration

```json
{
  "scripts": {
    "dev": "HOSTNAME=localhost PORT=3293 NODE_ENV=development npx next dev --hostname localhost --port 3293"
  }
}
```

### Key Configuration Details

- **Port**: 3293 (chosen to avoid conflicts with common development ports)
- **Hostname**: Explicitly set to `localhost` for compatibility
- **Environment**: Development mode with full debugging enabled
- **Binding**: Explicit hostname/port binding to prevent connection issues

### Why This Configuration?

The explicit configuration was implemented to solve startup issues encountered with:
- Node.js v23.x compatibility
- Default Next.js server binding behavior
- Port conflicts with other development tools

### Alternative Commands

```bash
npm run dev:simple    # Standard Next.js (port 3000)
npm run dev:debug     # With Node.js debugger (port 3000)
```

## Production Server

### Vercel Deployment

- **URL**: https://review-forge-p5ixuldws-brandons-projects-00601e6a.vercel.app
- **Environment Variables**: 
  - `GEMINI_API_KEY`: Google AI API key
  - `APIFY_API_TOKEN`: Apify API token
- **Build**: Next.js static optimization enabled
- **Runtime**: Node.js 20.x

### Environment Variables

Required environment variables for full functionality:

```env
GEMINI_API_KEY=your_gemini_api_key_here
APIFY_API_TOKEN=your_apify_api_token_here
```

## Troubleshooting

### Common Issues

1. **Connection Refused**: 
   - Ensure port 3293 is available
   - Try `npm run dev:simple` for port 3000
   - Check firewall/security software

2. **Build Errors**:
   - Clear cache: `rm -rf .next`
   - Reinstall dependencies: `npm install`

3. **Hydration Errors**:
   - Disable browser extensions
   - Clear browser cache
   - Check for client/server rendering mismatches

### Debugging

Enable detailed logging:
```bash
DEBUG=* npm run dev
```

Or use the debug script:
```bash
npm run dev:debug
```

## Architecture Notes

- **Next.js 15.2.3**: Latest stable version
- **React 18**: Server Components enabled
- **TypeScript**: Full type safety
- **Tailwind CSS**: Utility-first styling
- **Genkit**: AI orchestration framework
- **Apify**: Amazon data scraping service
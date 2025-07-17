# Changelog

All notable changes to Review Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Created changelog to track project changes

### Changed
- Updated development server port from 9002 to 8080 to resolve connection issues
- Updated README.md with correct port information (localhost:8080)
- Improved error message styling with better contrast (red background with darker red text)

### Fixed
- Fixed localhost connection refused errors by changing default port configuration
- Improved error message readability with proper color scheme

### Known Issues
- Server Components render errors still occurring in production builds
- Vercel deployment requires environment variables to be configured
- Production error messages are generic due to Next.js security (hiding sensitive details)

## [0.1.0] - Initial Release

### Added
- AI-powered Amazon product review generator
- Integration with Google Genkit and Gemini AI
- Product information fetching via Apify API
- Amazon product URL parsing and ASIN extraction
- Customer review analysis and incorporation
- Star rating input system
- Review refinement functionality
- Authentication system with password protection
- Responsive UI with dark/light mode support
- Firebase App Hosting configuration
- Real-time product image display
- Copy-to-clipboard functionality
- Notification sound system
- Error handling and user feedback

### Tech Stack
- Next.js 15 with React 18
- TypeScript
- Tailwind CSS with shadcn/ui components
- Google Genkit for AI orchestration
- Apify for Amazon data scraping
- Firebase for hosting
- Zod for schema validation
# Changelog

All notable changes to Review Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Created changelog to track project changes
- Added model update warning banner for newer Gemini models
- Added dismissible notification about Gemini 3.0 availability

### Changed
- Updated development server port from 9002 to 3293 to resolve connection issues
- Updated README.md with correct port information (localhost:3293)
- Improved error message styling with better contrast (red background with darker red text)
- Updated Gemini AI model from deprecated `gemini-2.5-flash-preview-04-17` to `gemini-2.5-flash`
- Simplified development server configuration for better reliability

### Fixed
- Fixed localhost connection refused errors by using explicit Next.js configuration
- Improved error message readability with proper color scheme
- Fixed 404 errors from deprecated Gemini model reference
- Resolved hydration errors by fixing model configuration
- Fixed Next.js development server startup issues with explicit hostname/port binding

### Known Issues
- Vercel deployment requires environment variables to be configured in project settings
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
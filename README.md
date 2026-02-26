# Figma-Slack Activity Aggregator

A serverless application that collects activity from multiple Figma accounts and posts aggregated summaries to Slack for indexing by Glean.

## Features

- Multi-account Figma activity collection
- Secure PAT management with encryption
- User authentication and authorization
- Automated digest generation via cron
- PAT expiration monitoring and notifications
- Slack integration for searchable activity logs

## Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Next.js (App Router)
- **Platform**: Vercel Serverless Functions
- **Storage**: Vercel KV (Redis-compatible)
- **Authentication**: NextAuth.js
- **Testing**: Jest + fast-check (property-based testing)

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Vercel account (for deployment)
- Figma Personal Access Tokens
- Slack incoming webhook URL

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Environment Variables

See `.env.example` for all required and optional environment variables.

### Required Variables

- `SLACK_WEBHOOK_URL`: Slack incoming webhook URL
- `ENCRYPTION_KEY`: 32-byte hex string for AES-256 encryption
- `KV_REST_API_URL`: Vercel KV connection URL
- `KV_REST_API_TOKEN`: Vercel KV authentication token
- `NEXTAUTH_SECRET`: Secret for NextAuth.js session encryption
- `NEXTAUTH_URL`: Application URL

### Optional Variables

- `ALLOWED_EMAILS`: Comma-separated email whitelist
- `DIGEST_LOOKBACK_HOURS`: Hours to look back for activity (default: 24)

## Testing

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Generate coverage report:

```bash
npm run test:coverage
```

## Deployment

Deploy to Vercel:

```bash
vercel
```

Configure environment variables in the Vercel dashboard and set up Vercel KV storage.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── config/            # Configuration interface
│   └── layout.tsx         # Root layout
├── lib/                   # Core library code
│   ├── figmaClient.ts     # Figma API client
│   ├── activity.ts        # Activity normalization
│   ├── summary.ts         # Summary generation
│   ├── slack.ts           # Slack integration
│   ├── storage.ts         # Storage layer
│   ├── patMonitor.ts      # PAT expiration monitoring
│   └── auth.ts            # Authentication utilities
├── __tests__/             # Test files
├── .env.example           # Environment variable template
├── vercel.json            # Vercel configuration
└── README.md              # This file
```

## License

ISC

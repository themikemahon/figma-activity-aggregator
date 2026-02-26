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

## Documentation

### Setup and Deployment
- [SETUP.md](./SETUP.md) - Local development setup
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide for Vercel
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Detailed environment variable setup
- [CRON_CONFIGURATION.md](./CRON_CONFIGURATION.md) - Cron job scheduling guide

### User Documentation
- [USER_GUIDE.md](./docs/USER_GUIDE.md) - Complete user guide for managing Figma accounts and understanding Slack messages

### Developer Documentation
- [DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md) - Architecture, components, testing, and troubleshooting guide
- [AUTHENTICATION.md](./docs/AUTHENTICATION.md) - Authentication setup details
- [VERCEL_KV_SETUP.md](./docs/VERCEL_KV_SETUP.md) - Vercel KV database setup

## Deployment

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md).

Quick start:

1. Create a Vercel KV database
2. Configure environment variables in Vercel dashboard
3. Deploy:

```bash
vercel --prod
```

4. Configure cron job (already set in `vercel.json`)
5. Add Figma accounts via `/config` interface

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup guide.

## Usage

After deployment, users can:

1. Sign in at `/config` using magic link authentication
2. Add Figma Personal Access Tokens for their accounts
3. View activity summaries in Slack
4. Search activity history using Slack search or Glean

For detailed usage instructions, see [USER_GUIDE.md](./docs/USER_GUIDE.md).

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
├── docs/                  # Documentation
│   ├── USER_GUIDE.md      # User documentation
│   └── DEVELOPER_GUIDE.md # Developer documentation
├── .env.example           # Environment variable template
├── vercel.json            # Vercel configuration
└── README.md              # This file
```

For detailed architecture and component descriptions, see [DEVELOPER_GUIDE.md](./docs/DEVELOPER_GUIDE.md).

## License

ISC

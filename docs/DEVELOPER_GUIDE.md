# Developer Guide: Figma-to-Slack Activity Aggregator

This guide provides technical documentation for developers working on the Figma-to-Slack Activity Aggregator.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Descriptions](#component-descriptions)
3. [Data Flow](#data-flow)
4. [Testing Guide](#testing-guide)
5. [Development Workflow](#development-workflow)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Contributing](#contributing)

## Architecture Overview

### System Design

The application follows a serverless architecture deployed on Vercel with the following key characteristics:

- **Stateless**: No in-memory state between function invocations
- **Event-driven**: Triggered by cron jobs or manual API calls
- **Multi-tenant**: Supports multiple users with isolated data
- **Secure**: Encryption at rest, read-only API access

### Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  - Next.js 16 (App Router)                                  │
│  - React 19                                                  │
│  - TypeScript 5                                             │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     API Layer                                │
│  - Next.js API Routes                                       │
│  - NextAuth.js (Authentication)                             │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                    Business Logic Layer                      │
│  - FigmaClient (API integration)                            │
│  - ActivityNormalizer (Data transformation)                 │
│  - SummaryGenerator (Aggregation)                           │
│  - SlackPoster (External integration)                       │
│  - PATMonitor (Expiration tracking)                         │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                               │
│  - Storage (Abstraction)                                    │
│  - Vercel KV (Redis)                                        │
│  - Encryption (AES-256-GCM)                                 │
└─────────────────────────────────────────────────────────────┘


### Project Structure

```
figma-slack-aggregator/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── auth/                 # NextAuth.js endpoints
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts      # Auth configuration
│   │   ├── config/               # Configuration API
│   │   │   └── accounts/
│   │   │       ├── route.ts      # List/create accounts
│   │   │       └── [accountName]/
│   │   │           └── route.ts  # Update/delete account
│   │   └── run-figma-digest/
│   │       └── route.ts          # Digest orchestration
│   ├── config/                   # Configuration UI
│   │   ├── page.tsx              # Main config page
│   │   └── ConfigInterface.tsx   # React component
│   ├── auth/                     # Auth pages
│   │   ├── signin/
│   │   ├── error/
│   │   └── verify-request/
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   └── providers.tsx             # Client providers
├── lib/                          # Core business logic
│   ├── figmaClient.ts            # Figma API wrapper
│   ├── activity.ts               # Event normalization
│   ├── summary.ts                # Summary generation
│   ├── slack.ts                  # Slack integration
│   ├── storage.ts                # Data persistence
│   ├── patMonitor.ts             # PAT expiration
│   ├── auth.ts                   # Auth utilities
│   ├── config.ts                 # Config validation
│   └── logger.ts                 # Logging utilities
├── __tests__/                    # Test files
│   ├── figmaClient.test.ts
│   ├── activity.test.ts
│   ├── summary.test.ts
│   ├── slack.test.ts
│   ├── storage.test.ts
│   ├── patMonitor.test.ts
│   ├── auth.test.ts
│   ├── config.test.ts
│   ├── configApi.test.ts
│   ├── digest.test.ts
│   └── logger.test.ts
├── types/                        # TypeScript types
│   └── next-auth.d.ts
├── docs/                         # Documentation
│   ├── USER_GUIDE.md
│   ├── DEVELOPER_GUIDE.md
│   ├── AUTHENTICATION.md
│   └── VERCEL_KV_SETUP.md
├── .env.example                  # Environment template
├── .env.local                    # Local environment (gitignored)
├── jest.config.js                # Jest configuration
├── jest.setup.js                 # Jest setup
├── next.config.js                # Next.js config
├── tsconfig.json                 # TypeScript config
├── vercel.json                   # Vercel deployment
├── package.json                  # Dependencies
├── README.md                     # Project overview
├── SETUP.md                      # Setup summary
├── DEPLOYMENT.md                 # Deployment guide
├── ENVIRONMENT_VARIABLES.md      # Env var guide
└── CRON_CONFIGURATION.md         # Cron guide
```


## Component Descriptions

### 1. FigmaClient (`lib/figmaClient.ts`)

**Purpose**: Wrapper for Figma REST API with rate limiting and error handling.

**Key Methods**:
- `getMe()`: Get authenticated user info and team IDs
- `listTeamProjects(teamId)`: List projects for a team
- `listProjectFiles(projectId)`: List files in a project
- `listFileVersions(fileKey, options)`: Get file versions with pagination
- `listFileComments(fileKey)`: Get comments on a file
- `getFileMeta(fileKey)`: Get file metadata

**Features**:
- Exponential backoff for rate limits
- Respects `Retry-After` headers
- Descriptive error messages with status codes
- Pagination support for large datasets

**Usage Example**:
```typescript
const client = new FigmaClient({
  accessToken: decryptedPAT,
  accountName: 'personal'
});

const user = await client.getMe();
const projects = await client.listTeamProjects(user.teams[0].id);
const versions = await client.listFileVersions(fileKey, {
  since: lastDigestTime
});
```

**Error Handling**:
- `401/403`: Invalid or expired PAT (fatal)
- `429`: Rate limit (retry with backoff)
- `5xx`: Temporary failure (retry)
- Network errors: Retry with exponential backoff

### 2. ActivityNormalizer (`lib/activity.ts`)

**Purpose**: Transform Figma API responses into standardized ActivityEvent objects.

**Key Methods**:
- `normalizeVersion()`: Convert file version to ActivityEvent
- `normalizeComment()`: Convert comment to ActivityEvent
- `filterByTimestamp()`: Filter events by time range
- `generateDeepLink()`: Create Figma deep links

**ActivityEvent Interface**:
```typescript
interface ActivityEvent {
  ts: string;              // ISO 8601 timestamp
  account: string;         // Account identifier
  projectId: string;
  projectName: string;
  fileKey: string;
  fileName: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: ActionType;
  url: string;             // Deep link to Figma
  metadata?: Record<string, any>;
}
```

**Deep Link Formats**:
- Version: `https://www.figma.com/file/{fileKey}?version-id={versionId}`
- Comment: `https://www.figma.com/file/{fileKey}?comment-id={commentId}`
- Base: `https://www.figma.com/file/{fileKey}`

### 3. SummaryGenerator (`lib/summary.ts`)

**Purpose**: Aggregate ActivityEvents into human-readable summaries.

**Key Methods**:
- `generatePerEventSummaries()`: Create individual event messages
- `generateDailyRecap()`: Create daily summary with breakdowns
- `groupEvents()`: Group by user, project, or account
- `countByAction()`: Count events by action type

**Message Formats**:

Per-event:
```
[FIGMA][account] timestamp – project • user – action "file" url
```

Daily recap:
```
📊 Figma Activity Recap - Date

Total Events: N across M accounts

By Person: ...
By Project: ...
By Account: ...
```

### 4. SlackPoster (`lib/slack.ts`)

**Purpose**: Post formatted messages to Slack via webhook.

**Key Methods**:
- `postMessage()`: Post single message with retry
- `postMessages()`: Post multiple messages with rate limiting
- `postPATWarning()`: Post PAT expiration warning

**Features**:
- Retry logic: 3 attempts with exponential backoff
- Rate limiting: 1 message per second
- Error logging with context
- Support for plain text and Block Kit

**Usage Example**:
```typescript
const poster = new SlackPoster({
  webhookUrl: process.env.SLACK_WEBHOOK_URL!
});

await poster.postMessage({
  text: '[FIGMA][personal] Activity message...'
});
```

### 5. Storage (`lib/storage.ts`)

**Purpose**: Manage persistent data in Vercel KV with encryption.

**Key Methods**:
- `saveUserAccount()`: Store encrypted PAT
- `getUserAccounts()`: Get user's accounts
- `getAllUserAccounts()`: Get all accounts (for digest)
- `deleteUserAccount()`: Remove account and PAT
- `getLastDigestTime()`: Get last digest timestamp
- `updateLastDigestTime()`: Update digest timestamp
- `encryptPAT()`: Encrypt PAT with AES-256-GCM
- `decryptPAT()`: Decrypt PAT

**Storage Schema** (Redis keys):
```
user:{userId}:accounts                          → Set of account names
user:{userId}:account:{accountName}:pat         → Encrypted PAT
user:{userId}:account:{accountName}:expires     → Expiration timestamp
user:{userId}:account:{accountName}:lastDigest  → Last digest timestamp
users                                           → Set of all user IDs
```

**Encryption**:
- Algorithm: AES-256-GCM
- Key: 32-byte hex string from `ENCRYPTION_KEY`
- IV: Unique per encryption, stored with ciphertext
- Format: `{iv}:{authTag}:{encrypted}`

### 6. PATMonitor (`lib/patMonitor.ts`)

**Purpose**: Check PAT expiration and generate notifications.

**Key Methods**:
- `checkPATExpiration()`: Check single PAT
- `checkAllPATs()`: Check all PATs across users
- `extractExpiration()`: Parse expiration from Figma API

**PATStatus Interface**:
```typescript
interface PATStatus {
  userId: string;
  accountName: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  needsWarning: boolean;  // true if expires within 3 days
}
```

**Warning Thresholds**:
- 3 days before expiration: Warning
- Already expired: Urgent notification
- Multiple warnings: Consolidated into single message

### 7. Authentication (`lib/auth.ts`)

**Purpose**: User authentication and session management.

**Implementation**: NextAuth.js with magic link provider

**Configuration**:
- Provider: Email (magic link)
- Session: JWT-based
- Storage: Vercel KV
- Callbacks: Email whitelist enforcement

**Auth Flow**:
1. User enters email
2. System sends magic link
3. User clicks link
4. Session created
5. Redirect to `/config`

**Authorization**:
- Users can only access their own PATs
- Email whitelist (optional): `ALLOWED_EMAILS`
- Session expiration: 30 days


## Data Flow

### Digest Flow (Complete)

```
1. Cron Trigger
   └─> /api/run-figma-digest

2. Retrieve All User Accounts
   └─> Storage.getAllUserAccounts()
   └─> Returns: UserAccount[] with encrypted PATs

3. For Each User Account:
   a. Decrypt PAT
      └─> Storage.decryptPAT(encryptedPAT)
   
   b. Create Figma Client
      └─> new FigmaClient({ accessToken, accountName })
   
   c. Get User Info
      └─> client.getMe()
      └─> Extract team IDs
   
   d. For Each Team:
      i. List Projects
         └─> client.listTeamProjects(teamId)
      
      ii. For Each Project:
          - List Files
            └─> client.listProjectFiles(projectId)
          
          - For Each File:
            * Get Versions
              └─> client.listFileVersions(fileKey, { since: lastDigestTime })
            
            * Get Comments
              └─> client.listFileComments(fileKey)
            
            * Normalize Events
              └─> ActivityNormalizer.normalizeVersion()
              └─> ActivityNormalizer.normalizeComment()
   
   e. Check PAT Expiration
      └─> PATMonitor.checkPATExpiration(userId, accountName, pat)
   
   f. Handle Errors
      └─> Log error, continue with next account

4. Aggregate All Events
   └─> Combine events from all accounts
   └─> Filter by timestamp
   └─> Sort by timestamp

5. Generate Summaries
   └─> SummaryGenerator.generatePerEventSummaries(events)
   └─> SummaryGenerator.generateDailyRecap(events, date)

6. Post to Slack
   └─> SlackPoster.postMessages(summaries)
   └─> Rate limit: 1 message/second
   └─> Retry on failure

7. Post PAT Warnings
   └─> For each expiring/expired PAT
   └─> SlackPoster.postPATWarning(...)

8. Update Digest Timestamps
   └─> For each account
   └─> Storage.updateLastDigestTime(userId, accountName, now)

9. Return Response
   └─> { success, eventsProcessed, accountsProcessed, errors, duration }
```

### Configuration Flow

```
1. User Visits /config
   └─> NextAuth.js checks session
   └─> Redirect to /auth/signin if not authenticated

2. User Signs In
   └─> Enter email
   └─> NextAuth.js sends magic link
   └─> User clicks link
   └─> Session created
   └─> Redirect to /config

3. Load User Accounts
   └─> GET /api/config/accounts
   └─> Storage.getUserAccounts(userId)
   └─> Return masked PATs

4. Add Account
   └─> User enters account name and PAT
   └─> POST /api/config/accounts
   └─> Validate PAT (test Figma API call)
   └─> Encrypt PAT
   └─> Storage.saveUserAccount(account)
   └─> Return success

5. Update Account
   └─> User enters new PAT
   └─> PUT /api/config/accounts/:accountName
   └─> Validate new PAT
   └─> Encrypt new PAT
   └─> Storage.saveUserAccount(account)
   └─> Return success

6. Delete Account
   └─> User confirms deletion
   └─> DELETE /api/config/accounts/:accountName
   └─> Storage.deleteUserAccount(userId, accountName)
   └─> Return success
```

### Error Handling Flow

```
1. Error Occurs
   └─> Catch in try/catch block

2. Classify Error
   ├─> Recoverable (429, 5xx, network)
   │   └─> Retry with exponential backoff
   │   └─> Log retry attempt
   │   └─> If max retries exceeded, treat as fatal
   │
   └─> Fatal (401, 403, validation)
       └─> Log error with context
       └─> Continue with next account (if in digest)
       └─> Return error response (if in API)

3. Log Error
   └─> logger.error(message, context)
   └─> Include: timestamp, component, operation, error details
   └─> Sanitize: Remove PATs, webhook URLs

4. Notify User (if applicable)
   └─> Post error to Slack
   └─> Include: account name, error type, action needed

5. Return Response
   └─> Include error in response
   └─> Continue processing (graceful degradation)
```


## Testing Guide

### Testing Philosophy

The project uses a dual testing approach:

1. **Unit Tests**: Verify specific examples and edge cases
2. **Property-Based Tests**: Verify universal properties across random inputs

### Test Structure

```
__tests__/
├── figmaClient.test.ts       # Figma API client tests
├── activity.test.ts          # Activity normalization tests
├── summary.test.ts           # Summary generation tests
├── slack.test.ts             # Slack integration tests
├── storage.test.ts           # Storage layer tests
├── patMonitor.test.ts        # PAT monitoring tests
├── auth.test.ts              # Authentication tests
├── config.test.ts            # Configuration tests
├── configApi.test.ts         # Config API tests
├── digest.test.ts            # Digest orchestration tests
└── logger.test.ts            # Logging tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test figmaClient.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="FigmaClient"
```

### Writing Unit Tests

**Example**: Testing activity normalization

```typescript
import { ActivityNormalizer } from '@/lib/activity';

describe('ActivityNormalizer', () => {
  describe('normalizeVersion', () => {
    it('should normalize file version into ActivityEvent', () => {
      const version = {
        id: 'v123',
        created_at: '2026-02-26T09:03:45Z',
        label: 'Version 1',
        user: {
          id: 'u456',
          handle: 'sarah',
          img_url: 'https://...'
        }
      };
      
      const file = {
        key: 'f789',
        name: 'Homepage Concepts'
      };
      
      const project = {
        id: 'p012',
        name: 'Brand System'
      };
      
      const event = ActivityNormalizer.normalizeVersion(
        version,
        file,
        project,
        'personal'
      );
      
      expect(event.ts).toBe('2026-02-26T09:03:45Z');
      expect(event.account).toBe('personal');
      expect(event.projectName).toBe('Brand System');
      expect(event.fileName).toBe('Homepage Concepts');
      expect(event.action).toBe('FILE_VERSION_CREATED');
      expect(event.url).toContain('version-id=v123');
    });
    
    it('should handle missing user information', () => {
      const version = {
        id: 'v123',
        created_at: '2026-02-26T09:03:45Z',
        label: 'Version 1',
        user: null
      };
      
      const event = ActivityNormalizer.normalizeVersion(
        version,
        file,
        project,
        'personal'
      );
      
      expect(event.userId).toBeUndefined();
      expect(event.userName).toBeUndefined();
    });
  });
});
```

### Writing Property-Based Tests

**Example**: Testing deep link generation

```typescript
import fc from 'fast-check';
import { ActivityNormalizer } from '@/lib/activity';

describe('ActivityNormalizer - Property Tests', () => {
  it('should generate valid deep links for any file key and version ID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),  // fileKey
        fc.string({ minLength: 1 }),  // versionId
        (fileKey, versionId) => {
          const url = ActivityNormalizer.generateDeepLink(fileKey, {
            versionId
          });
          
          // Property: URL should be valid
          expect(url).toMatch(/^https:\/\/www\.figma\.com\/file\//);
          
          // Property: URL should contain file key
          expect(url).toContain(fileKey);
          
          // Property: URL should contain version-id parameter
          expect(url).toContain('version-id=');
          expect(url).toContain(versionId);
          
          // Property: URL should be parseable
          expect(() => new URL(url)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Goals

- **Overall**: 80%+ coverage
- **Critical paths**: 100% coverage
  - Storage encryption/decryption
  - PAT validation
  - Error handling
  - Authorization checks
- **Business logic**: 90%+ coverage
  - Activity normalization
  - Summary generation
  - Digest orchestration

### Mocking Guidelines

**DO mock**:
- External API calls (Figma, Slack)
- Database operations (in integration tests)
- Time-dependent functions (`Date.now()`)
- Environment variables

**DON'T mock**:
- Business logic functions
- Data transformations
- Utility functions
- Internal module dependencies

**Example**: Mocking Figma API

```typescript
import { FigmaClient } from '@/lib/figmaClient';

jest.mock('@/lib/figmaClient');

describe('Digest', () => {
  it('should handle Figma API errors gracefully', async () => {
    const mockClient = {
      getMe: jest.fn().mockRejectedValue(new Error('API Error')),
      listTeamProjects: jest.fn(),
      listProjectFiles: jest.fn(),
      listFileVersions: jest.fn(),
      listFileComments: jest.fn()
    };
    
    (FigmaClient as jest.Mock).mockImplementation(() => mockClient);
    
    const result = await runDigest();
    
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('API Error');
  });
});
```

### Testing Best Practices

1. **Test behavior, not implementation**: Focus on what the code does, not how
2. **Use descriptive test names**: Clearly state what is being tested
3. **Arrange-Act-Assert**: Structure tests clearly
4. **One assertion per test**: Keep tests focused
5. **Test edge cases**: Empty inputs, null values, boundary conditions
6. **Use property tests for universal properties**: Verify behavior across all inputs
7. **Mock external dependencies**: Isolate unit under test
8. **Clean up after tests**: Reset mocks, clear storage

### Debugging Tests

```bash
# Run tests with verbose output
npm test -- --verbose

# Run tests with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Run single test with console output
npm test -- --testNamePattern="specific test" --verbose
```

### Continuous Integration

Tests run automatically on:
- Every commit (via GitHub Actions)
- Every pull request
- Before deployment

**CI Configuration** (`.github/workflows/test.yml`):
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```


## Development Workflow

### Local Development Setup

1. **Clone repository**:
```bash
git clone <repository-url>
cd figma-slack-aggregator
```

2. **Install dependencies**:
```bash
npm install
```

3. **Set up environment variables**:
```bash
cp .env.example .env.local
# Edit .env.local with your values
```

4. **Set up local Redis** (optional):
```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or use Upstash test database
```

5. **Run development server**:
```bash
npm run dev
```

6. **Open browser**:
```
http://localhost:3000
```

### Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage
npm run test:coverage

# Type check
npx tsc --noEmit

# Lint code
npm run lint

# Format code
npm run format
```

### Git Workflow

1. **Create feature branch**:
```bash
git checkout -b feature/your-feature-name
```

2. **Make changes and commit**:
```bash
git add .
git commit -m "feat: add new feature"
```

3. **Push to remote**:
```bash
git push origin feature/your-feature-name
```

4. **Create pull request**:
- Go to GitHub
- Create PR from feature branch to main
- Add description and link to issue
- Request review

5. **After approval**:
```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```
feat(storage): add PAT encryption
fix(figma): handle rate limit errors
docs(readme): update setup instructions
test(activity): add property tests for normalization
```

### Code Style

**TypeScript**:
- Use strict mode
- Explicit return types for functions
- Prefer interfaces over types
- Use const for immutable values
- Avoid `any` type

**Naming Conventions**:
- Classes: PascalCase (`FigmaClient`)
- Functions: camelCase (`normalizeVersion`)
- Constants: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- Files: camelCase (`figmaClient.ts`)
- Components: PascalCase (`ConfigInterface.tsx`)

**File Organization**:
- One class per file
- Group related functions
- Export at bottom of file
- Import order: external, internal, types

**Example**:
```typescript
// External imports
import { kv } from '@vercel/kv';
import crypto from 'crypto';

// Internal imports
import { logger } from './logger';
import { config } from './config';

// Types
import type { UserAccount } from '@/types';

// Constants
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// Class definition
export class Storage {
  // Implementation
}

// Helper functions (if needed)
function sanitizeKey(key: string): string {
  // Implementation
}
```

### Adding New Features

1. **Update requirements** (if needed):
   - Edit `.kiro/specs/figma-slack-aggregator/requirements.md`
   - Add new acceptance criteria

2. **Update design** (if needed):
   - Edit `.kiro/specs/figma-slack-aggregator/design.md`
   - Add component descriptions
   - Add correctness properties

3. **Update tasks**:
   - Edit `.kiro/specs/figma-slack-aggregator/tasks.md`
   - Add implementation tasks

4. **Implement feature**:
   - Create/modify files in `lib/` or `app/`
   - Follow existing patterns
   - Add TypeScript types

5. **Write tests**:
   - Unit tests for specific cases
   - Property tests for universal properties
   - Integration tests for API routes

6. **Update documentation**:
   - Update README if needed
   - Update this developer guide
   - Add inline code comments

7. **Test locally**:
```bash
npm test
npm run build
npm run dev
```

8. **Create pull request**:
   - Follow git workflow above
   - Link to related issues
   - Add screenshots if UI changes

### Debugging

**Server-side debugging**:
```typescript
// Add console.log statements
console.log('Debug:', variable);

// Use debugger statement
debugger;

// Use logger
logger.debug('Debug message', { context });
```

**Client-side debugging**:
```typescript
// Browser console
console.log('Debug:', variable);

// React DevTools
// Install browser extension
```

**API debugging**:
```bash
# Test API endpoints
curl -X GET http://localhost:3000/api/run-figma-digest

# With authentication
curl -X GET http://localhost:3000/api/config/accounts \
  -H "Cookie: next-auth.session-token=..."
```

**Database debugging**:
```bash
# Connect to Upstash Redis
redis-cli -h your-db.upstash.io -p 6379 -a your-password

# List all keys
KEYS *

# Get value
GET user:123:account:personal:pat

# Delete key
DEL user:123:account:personal:pat
```

### Performance Optimization

**Figma API**:
- Cache team and project lists
- Use pagination for large datasets
- Parallel requests with concurrency limit
- Respect rate limits

**Storage**:
- Batch operations where possible
- Use Redis pipelines
- Cache frequently accessed data
- Set TTL on temporary data

**Slack**:
- Rate limit: 1 message/second
- Batch messages where possible
- Use Block Kit for rich formatting
- Retry failed requests

**Serverless Functions**:
- Minimize cold start time
- Optimize bundle size
- Use streaming for large responses
- Set appropriate timeout limits


## Troubleshooting Guide

### Common Issues and Solutions

#### Build Errors

**Issue**: TypeScript compilation errors

**Solution**:
```bash
# Check TypeScript errors
npx tsc --noEmit

# Fix common issues
- Add missing type definitions
- Fix type mismatches
- Update tsconfig.json if needed
```

**Issue**: Module not found errors

**Solution**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check import paths
- Use @/ for root imports
- Check file extensions (.ts, .tsx)
```

#### Runtime Errors

**Issue**: Environment variable not found

**Solution**:
```bash
# Check .env.local exists
ls -la .env.local

# Verify variable is set
echo $VARIABLE_NAME

# Restart dev server after changes
npm run dev
```

**Issue**: Redis connection errors

**Solution**:
```bash
# Verify KV credentials
- Check KV_REST_API_URL
- Check KV_REST_API_TOKEN
- Test connection in Upstash console

# Check network connectivity
curl -H "Authorization: Bearer $KV_REST_API_TOKEN" \
  "$KV_REST_API_URL/ping"
```

**Issue**: Figma API errors

**Solution**:
```typescript
// Check PAT validity
- Verify PAT is not expired
- Check PAT has correct permissions
- Test PAT in Figma API explorer

// Handle rate limits
- Implement exponential backoff
- Respect Retry-After headers
- Reduce request frequency
```

**Issue**: Slack webhook errors

**Solution**:
```bash
# Test webhook manually
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Test"}' \
  $SLACK_WEBHOOK_URL

# Check webhook configuration
- Verify URL is correct
- Check webhook is not disabled
- Verify channel permissions
```

#### Authentication Issues

**Issue**: Magic link not working

**Solution**:
```bash
# Check email configuration
- Verify EMAIL_SERVER is correct
- Check EMAIL_FROM is valid sender
- Test SMTP connection

# Check NextAuth configuration
- Verify NEXTAUTH_SECRET is set
- Check NEXTAUTH_URL matches deployment
- Review NextAuth logs
```

**Issue**: Session expired

**Solution**:
```typescript
// Increase session duration
// In app/api/auth/[...nextauth]/route.ts
session: {
  maxAge: 30 * 24 * 60 * 60, // 30 days
}

// Or implement refresh tokens
```

**Issue**: Authorization errors

**Solution**:
```typescript
// Check user ID extraction
const session = await getServerSession(authOptions);
const userId = session?.user?.email;

// Verify user has access
const accounts = await storage.getUserAccounts(userId);

// Check email whitelist
if (ALLOWED_EMAILS && !ALLOWED_EMAILS.includes(email)) {
  // User not allowed
}
```

#### Storage Issues

**Issue**: Encryption/decryption errors

**Solution**:
```bash
# Verify encryption key
echo -n $ENCRYPTION_KEY | wc -c  # Should be 64

# Regenerate if needed
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Re-encrypt all PATs with new key
# (requires migration script)
```

**Issue**: Data not persisting

**Solution**:
```typescript
// Check Redis connection
await kv.ping();

// Verify key format
const key = `user:${userId}:account:${accountName}:pat`;

// Check TTL
const ttl = await kv.ttl(key);
if (ttl > 0) {
  // Key will expire
}

// Set no expiration
await kv.set(key, value);  // No TTL
```

#### Deployment Issues

**Issue**: Vercel deployment fails

**Solution**:
```bash
# Check build logs
vercel logs

# Verify environment variables
vercel env ls

# Test build locally
npm run build

# Force redeploy
vercel --force
```

**Issue**: Cron job not running

**Solution**:
```bash
# Verify Vercel plan supports cron
# (Pro or Enterprise required)

# Check cron configuration
cat vercel.json | jq .crons

# View cron execution history
# Vercel Dashboard → Project → Cron Jobs

# Test endpoint manually
curl https://your-app.vercel.app/api/run-figma-digest
```

**Issue**: Function timeout

**Solution**:
```json
// Increase timeout in vercel.json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 60  // Max for Pro plan
    }
  }
}

// Or optimize processing
- Reduce accounts per run
- Increase cron frequency
- Implement pagination
- Parallel processing with limits
```

### Debugging Techniques

#### Enable Debug Logging

```typescript
// In lib/logger.ts
export const logger = {
  debug: (message: string, context?: any) => {
    if (process.env.DEBUG === 'true') {
      console.log('[DEBUG]', message, context);
    }
  },
  // ... other methods
};

// Set DEBUG=true in .env.local
```

#### Trace Request Flow

```typescript
// Add request ID to track flow
const requestId = crypto.randomUUID();

logger.info('Starting digest', { requestId });
// ... processing
logger.info('Completed digest', { requestId, duration });
```

#### Monitor Performance

```typescript
// Measure execution time
const start = Date.now();
await someOperation();
const duration = Date.now() - start;
logger.info('Operation completed', { duration });

// Track API call counts
let apiCalls = 0;
// ... increment on each call
logger.info('API calls made', { apiCalls });
```

#### Inspect Storage

```bash
# Connect to Redis
redis-cli -h your-db.upstash.io -p 6379 -a your-password

# List all users
SMEMBERS users

# List user's accounts
SMEMBERS user:user@example.com:accounts

# Get encrypted PAT
GET user:user@example.com:account:personal:pat

# Get last digest time
GET user:user@example.com:account:personal:lastDigest
```

### Performance Profiling

#### Profile Function Execution

```typescript
// Use console.time/timeEnd
console.time('digest');
await runDigest();
console.timeEnd('digest');

// Use performance API
const start = performance.now();
await runDigest();
const end = performance.now();
console.log(`Digest took ${end - start}ms`);
```

#### Profile Memory Usage

```typescript
// Check memory usage
const used = process.memoryUsage();
console.log({
  rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
});
```

#### Profile API Calls

```typescript
// Track API call latency
const apiLatencies: number[] = [];

async function timedFetch(url: string, options: any) {
  const start = Date.now();
  const response = await fetch(url, options);
  const latency = Date.now() - start;
  apiLatencies.push(latency);
  return response;
}

// Calculate statistics
const avg = apiLatencies.reduce((a, b) => a + b, 0) / apiLatencies.length;
const max = Math.max(...apiLatencies);
console.log({ avgLatency: avg, maxLatency: max });
```

### Getting Help

#### Internal Resources

1. Check this developer guide
2. Review design document
3. Check test files for examples
4. Review existing code patterns

#### External Resources

1. [Next.js Documentation](https://nextjs.org/docs)
2. [Vercel Documentation](https://vercel.com/docs)
3. [Figma API Documentation](https://www.figma.com/developers/api)
4. [NextAuth.js Documentation](https://next-auth.js.org/)
5. [Upstash Redis Documentation](https://docs.upstash.com/redis)

#### Community Support

1. GitHub Issues: Report bugs and request features
2. GitHub Discussions: Ask questions and share ideas
3. Team Chat: Internal communication channel

## Contributing

### Contribution Guidelines

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Write tests**
5. **Update documentation**
6. **Submit a pull request**

### Pull Request Checklist

- [ ] Code follows project style guidelines
- [ ] All tests pass (`npm test`)
- [ ] New tests added for new features
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] No console.log statements (use logger)
- [ ] No sensitive data in code
- [ ] TypeScript types are correct
- [ ] Build succeeds (`npm run build`)

### Code Review Process

1. **Automated checks**: Tests, linting, type checking
2. **Peer review**: At least one approval required
3. **Address feedback**: Make requested changes
4. **Merge**: Squash and merge to main

### Release Process

1. **Version bump**: Update package.json version
2. **Changelog**: Update CHANGELOG.md
3. **Tag release**: Create git tag
4. **Deploy**: Merge to main triggers deployment
5. **Verify**: Test production deployment
6. **Announce**: Notify team of release

## Additional Resources

### Documentation

- [README.md](../README.md) - Project overview
- [SETUP.md](../SETUP.md) - Setup summary
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment guide
- [ENVIRONMENT_VARIABLES.md](../ENVIRONMENT_VARIABLES.md) - Environment setup
- [CRON_CONFIGURATION.md](../CRON_CONFIGURATION.md) - Cron setup
- [USER_GUIDE.md](./USER_GUIDE.md) - User documentation
- [AUTHENTICATION.md](./AUTHENTICATION.md) - Auth setup
- [VERCEL_KV_SETUP.md](./VERCEL_KV_SETUP.md) - KV setup

### Specifications

- [Requirements](../.kiro/specs/figma-slack-aggregator/requirements.md)
- [Design](../.kiro/specs/figma-slack-aggregator/design.md)
- [Tasks](../.kiro/specs/figma-slack-aggregator/tasks.md)

### External Links

- [Figma API Reference](https://www.figma.com/developers/api)
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Upstash Documentation](https://docs.upstash.com/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [fast-check Documentation](https://fast-check.dev/)

---

**Last Updated**: February 26, 2026

For questions or issues, please open a GitHub issue or contact the development team.

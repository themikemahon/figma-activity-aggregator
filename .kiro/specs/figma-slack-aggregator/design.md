# Design Document: Figma-to-Slack Activity Aggregator

## Overview

The Figma-to-Slack Activity Aggregator is a Node.js/TypeScript serverless application deployed on Vercel that collects activity from multiple Figma accounts and posts aggregated summaries to Slack. The system addresses the limitation that Figma's native Slack integration only supports one account per Slack workspace, enabling users to track work across multiple Figma accounts in a single searchable location indexed by Glean.

The application operates in a polling mode (Phase 1 MVP), periodically fetching activity from Figma's REST API and posting formatted messages to Slack via incoming webhooks. The architecture is designed to support future enhancements including real-time webhooks (Phase 4) and time estimation features (Phase 3).

### Key Design Principles

1. **Multi-tenancy**: Support multiple users, each with their own set of Figma PATs
2. **Security-first**: Encrypt PATs at rest, use read-only Figma scopes, minimal Slack permissions
3. **Serverless-native**: Stateless design compatible with Vercel's execution model and timeout constraints
4. **Incremental processing**: Track last-processed timestamps to avoid duplicate events
5. **Graceful degradation**: Continue processing when individual accounts fail

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Vercel Platform                          │
│                                                                   │
│  ┌────────────────┐      ┌──────────────────┐                  │
│  │  /config       │      │ /api/run-figma-  │                  │
│  │  (Web UI)      │◄────►│    digest        │                  │
│  │                │      │  (Cron trigger)  │                  │
│  └────────┬───────┘      └────────┬─────────┘                  │
│           │                       │                              │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌─────────────────────────────────────────┐                   │
│  │         Storage Layer (Vercel KV)        │                   │
│  │  - User accounts & encrypted PATs        │                   │
│  │  - Last digest timestamps                │                   │
│  │  - PAT expiration dates                  │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                   │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Figma API  │    │   Figma API  │    │   Figma API  │
│  (Account 1) │    │  (Account 2) │    │  (Account N) │
└──────────────┘    └──────────────┘    └──────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Slack Webhook│
                    │   (Incoming) │
                    └──────────────┘
```

### Data Flow

1. **Configuration Flow**:
   - User authenticates to `/config` interface
   - User adds/updates Figma PATs for their accounts
   - System validates PATs via Figma API test call
   - PATs encrypted and stored in Vercel KV with user association

2. **Digest Flow**:
   - Cron job or manual trigger hits `/api/run-figma-digest`
   - System retrieves all users' PATs from storage
   - For each user and each of their accounts:
     - Fetch activity since last digest timestamp
     - Normalize events into ActivityEvent objects
     - Check PAT expiration and generate warnings if needed
   - Aggregate all events across users
   - Generate formatted summaries
   - Post to Slack webhook
   - Update last digest timestamp

### Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Platform**: Vercel Serverless Functions
- **Storage**: Vercel KV (Redis-compatible key-value store)
- **Authentication**: NextAuth.js with magic link or OAuth provider
- **Encryption**: Node.js crypto module for PAT encryption
- **HTTP Client**: fetch API (native in Node 18+)
- **Figma API**: REST API v1 endpoints
- **Slack Integration**: Incoming webhook (no bot token required)

## Components and Interfaces

### 1. Figma Client (`lib/figmaClient.ts`)

Wrapper for Figma REST API interactions with rate limiting and error handling.

```typescript
interface FigmaClientConfig {
  accessToken: string;
  accountName: string;
}

class FigmaClient {
  constructor(config: FigmaClientConfig);
  
  // Get user info to extract team IDs
  async getMe(): Promise<FigmaUser>;
  
  // List projects for a team
  async listTeamProjects(teamId: string): Promise<FigmaProject[]>;
  
  // List files in a project
  async listProjectFiles(projectId: string): Promise<FigmaFile[]>;
  
  // Get file versions with pagination
  async listFileVersions(
    fileKey: string,
    options?: { since?: string }
  ): Promise<FigmaVersion[]>;
  
  // Get comments on a file
  async listFileComments(fileKey: string): Promise<FigmaComment[]>;
  
  // Get file metadata
  async getFileMeta(fileKey: string): Promise<FigmaFileMeta>;
}

interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

interface FigmaProject {
  id: string;
  name: string;
}

interface FigmaFile {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

interface FigmaVersion {
  id: string;
  created_at: string;  // ISO 8601
  label: string;
  description: string;
  user: {
    id: string;
    handle: string;
    img_url: string;
  };
}

interface FigmaComment {
  id: string;
  file_key: string;
  parent_id: string;
  user: {
    id: string;
    handle: string;
    img_url: string;
  };
  created_at: string;  // ISO 8601
  resolved_at: string | null;
  message: string;
}

interface FigmaFileMeta {
  name: string;
  last_modified: string;
  thumbnail_url: string;
  version: string;
}
```

**Implementation Notes**:
- Use exponential backoff for rate limit handling (respect `Retry-After` header)
- Throw descriptive errors with status codes and response bodies
- Support pagination for file versions endpoint
- Cache team IDs per PAT to avoid repeated `/v1/me` calls

### 2. Activity Normalizer (`lib/activity.ts`)

Transforms Figma API responses into standardized ActivityEvent objects.

```typescript
type AccountName = string;  // e.g., 'gen', 'clientA', 'clientB'

type ActionType = 
  | 'FILE_VERSION_CREATED'
  | 'COMMENT_ADDED'
  | 'LIBRARY_PUBLISHED'
  | 'FILE_CREATED'
  | 'FILE_UPDATED'
  | string;  // Allow unknown action types

interface ActivityEvent {
  ts: string;            // ISO 8601 timestamp
  account: AccountName;  // Which Figma account
  projectId: string;
  projectName: string;
  fileKey: string;
  fileName: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: ActionType;
  url: string;           // Deep link to Figma
  metadata?: Record<string, any>;  // Additional context
}

class ActivityNormalizer {
  // Normalize file version into ActivityEvent
  static normalizeVersion(
    version: FigmaVersion,
    file: FigmaFile,
    project: FigmaProject,
    account: AccountName
  ): ActivityEvent;
  
  // Normalize comment into ActivityEvent
  static normalizeComment(
    comment: FigmaComment,
    file: FigmaFile,
    project: FigmaProject,
    account: AccountName
  ): ActivityEvent;
  
  // Filter events by timestamp
  static filterByTimestamp(
    events: ActivityEvent[],
    since: string
  ): ActivityEvent[];
  
  // Generate deep link URL
  static generateDeepLink(
    fileKey: string,
    options?: {
      versionId?: string;
      commentId?: string;
      nodeId?: string;
    }
  ): string;
}
```

**Implementation Notes**:
- Deep link format for versions: `https://www.figma.com/file/{fileKey}?version-id={versionId}`
- Deep link format for comments: `https://www.figma.com/file/{fileKey}?comment-id={commentId}`
- URL-encode all parameters
- Handle missing user information gracefully (set to undefined)
- Preserve original Figma timestamps in ISO 8601 format

### 3. Summary Generator (`lib/summary.ts`)

Aggregates ActivityEvents into human-readable summaries for Slack.

```typescript
interface SummaryOptions {
  format: 'per-event' | 'daily-recap';
  groupBy?: 'user' | 'project' | 'account';
}

interface Summary {
  text: string;
  blocks?: any[];  // Slack Block Kit format (optional)
}

class SummaryGenerator {
  // Generate per-event messages
  static generatePerEventSummaries(
    events: ActivityEvent[]
  ): Summary[];
  
  // Generate daily recap with breakdowns
  static generateDailyRecap(
    events: ActivityEvent[],
    date: string
  ): Summary;
  
  // Group events by criteria
  static groupEvents(
    events: ActivityEvent[],
    groupBy: 'user' | 'project' | 'account'
  ): Map<string, ActivityEvent[]>;
  
  // Count events by type
  static countByAction(
    events: ActivityEvent[]
  ): Map<ActionType, number>;
}
```

**Message Format Examples**:

Per-event format:
```
[FIGMA][gen] 2026-02-26 09:03 – Brand System Revamp • Mike Mahon – Published new version of "Homepage Concepts" https://www.figma.com/file/...
```

Daily recap format:
```
📊 Figma Activity Recap - February 26, 2026

Total Events: 47 across 3 accounts

By Person:
• Mike Mahon: 23 events (15 versions, 8 comments)
• Sarah Chen: 18 events (12 versions, 6 comments)
• Alex Kumar: 6 events (4 versions, 2 comments)

By Project:
• Brand System Revamp: 31 events
• Mobile App Redesign: 12 events
• Marketing Site: 4 events

By Account:
• gen: 28 events
• clientA: 15 events
• clientB: 4 events
```

### 4. Slack Poster (`lib/slack.ts`)

Posts formatted messages to Slack via incoming webhook.

```typescript
interface SlackConfig {
  webhookUrl: string;
}

interface SlackMessage {
  text: string;
  blocks?: any[];
}

class SlackPoster {
  constructor(config: SlackConfig);
  
  // Post a single message
  async postMessage(message: SlackMessage): Promise<void>;
  
  // Post multiple messages with rate limiting
  async postMessages(messages: SlackMessage[]): Promise<void>;
  
  // Post PAT expiration warning
  async postPATWarning(
    userName: string,
    accountName: string,
    expiresAt: string,
    daysUntilExpiry: number
  ): Promise<void>;
}
```

**Implementation Notes**:
- Implement retry logic with exponential backoff (3 attempts)
- Rate limit: 1 message per second to avoid Slack rate limits
- Log all failures with request/response details
- Support both plain text and Block Kit formats

### 5. Storage Layer (`lib/storage.ts`)

Manages persistent data in Vercel KV with encryption for sensitive data.

```typescript
interface UserAccount {
  userId: string;
  accountName: string;
  encryptedPAT: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;  // PAT expiration date if known
}

interface DigestState {
  userId: string;
  accountName: string;
  lastDigestAt: string;  // ISO 8601
}

class Storage {
  // User account management
  async saveUserAccount(account: UserAccount): Promise<void>;
  async getUserAccounts(userId: string): Promise<UserAccount[]>;
  async getAllUserAccounts(): Promise<UserAccount[]>;
  async deleteUserAccount(userId: string, accountName: string): Promise<void>;
  
  // Digest state management
  async getLastDigestTime(userId: string, accountName: string): Promise<string | null>;
  async updateLastDigestTime(userId: string, accountName: string, timestamp: string): Promise<void>;
  
  // PAT encryption/decryption
  encryptPAT(pat: string): string;
  decryptPAT(encryptedPAT: string): string;
}
```

**Storage Schema** (Vercel KV keys):
- `user:{userId}:accounts` → Set of account names
- `user:{userId}:account:{accountName}:pat` → Encrypted PAT
- `user:{userId}:account:{accountName}:expires` → Expiration timestamp
- `user:{userId}:account:{accountName}:lastDigest` → Last digest timestamp
- `users` → Set of all user IDs

**Encryption**:
- Use AES-256-GCM for PAT encryption
- Store encryption key in `ENCRYPTION_KEY` environment variable
- Generate unique IV for each encrypted value
- Store IV alongside encrypted data

### 6. PAT Monitor (`lib/patMonitor.ts`)

Checks PAT expiration status and generates notifications.

```typescript
interface PATStatus {
  userId: string;
  accountName: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
  needsWarning: boolean;  // true if expires within 3 days
}

class PATMonitor {
  // Check expiration for a single PAT
  async checkPATExpiration(
    userId: string,
    accountName: string,
    pat: string
  ): Promise<PATStatus>;
  
  // Check all PATs and return those needing warnings
  async checkAllPATs(): Promise<PATStatus[]>;
  
  // Extract expiration from Figma API response
  static extractExpiration(figmaUser: FigmaUser): string | null;
}
```

**Implementation Notes**:
- Figma PATs may not always include expiration information in API responses
- If expiration cannot be determined, set to null and skip warnings
- Warning threshold: 3 days before expiration
- Consolidate multiple warnings into single Slack message

### 7. Authentication System (`lib/auth.ts`)

Handles user authentication for the configuration interface.

```typescript
interface AuthConfig {
  providers: ('magic-link' | 'google' | 'github')[];
  allowedEmails?: string[];  // Optional whitelist
}

// Using NextAuth.js
// Configuration in pages/api/auth/[...nextauth].ts
```

**Implementation Notes**:
- Use NextAuth.js for authentication
- Support magic link (email-based) as primary method
- Optionally support OAuth providers (Google, GitHub)
- Store user sessions in Vercel KV
- Implement email whitelist for access control if needed

### 8. API Routes

#### `/api/run-figma-digest`

Triggers the digest generation process.

```typescript
// GET /api/run-figma-digest
interface DigestResponse {
  success: boolean;
  eventsProcessed: number;
  accountsProcessed: number;
  errors: string[];
  duration: number;  // milliseconds
}
```

**Implementation**:
1. Retrieve all user accounts from storage
2. For each user and account:
   - Decrypt PAT
   - Create FigmaClient
   - Fetch activity since last digest
   - Check PAT expiration
3. Normalize all events
4. Generate summaries
5. Post to Slack
6. Update digest timestamps
7. Return summary statistics

**Error Handling**:
- Continue processing if individual accounts fail
- Log all errors with context
- Include error summary in response
- Post PAT expiration warnings even if digest fails

#### `/config`

Web interface for PAT management (Next.js page).

**Features**:
- Display user's configured accounts
- Add new account with PAT validation
- Update existing PAT
- Delete account
- Show PAT expiration status
- Mask PAT values in UI (show only last 4 characters)

**Implementation**:
- Server-side rendered Next.js page
- Protected by NextAuth.js authentication
- Form submission via API routes
- Real-time PAT validation feedback

#### `/api/config/accounts`

API endpoints for account management.

```typescript
// GET /api/config/accounts
interface GetAccountsResponse {
  accounts: {
    accountName: string;
    maskedPAT: string;  // e.g., "****...abc123"
    expiresAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
}

// POST /api/config/accounts
interface AddAccountRequest {
  accountName: string;
  pat: string;
}

interface AddAccountResponse {
  success: boolean;
  error?: string;
}

// DELETE /api/config/accounts/:accountName
interface DeleteAccountResponse {
  success: boolean;
}
```

## Data Models

### Core Types

```typescript
// User identity
interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
}

// Account configuration
interface Account {
  userId: string;
  accountName: string;
  pat: string;  // Decrypted in memory only
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Activity event (already defined above)
interface ActivityEvent {
  ts: string;
  account: AccountName;
  projectId: string;
  projectName: string;
  fileKey: string;
  fileName: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: ActionType;
  url: string;
  metadata?: Record<string, any>;
}

// Digest execution record
interface DigestExecution {
  id: string;
  startedAt: string;
  completedAt: string;
  eventsProcessed: number;
  accountsProcessed: number;
  errors: string[];
}
```

### Environment Variables

```typescript
// Required
SLACK_WEBHOOK_URL: string;
ENCRYPTION_KEY: string;  // 32-byte hex string for AES-256
KV_REST_API_URL: string;  // Vercel KV connection
KV_REST_API_TOKEN: string;
NEXTAUTH_SECRET: string;
NEXTAUTH_URL: string;

// Optional
ALLOWED_EMAILS: string;  // Comma-separated email whitelist
DIGEST_LOOKBACK_HOURS: number;  // Default: 24
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Multi-Account PAT Isolation

*For any* set of configured accounts, when the system polls Figma APIs, each account should use its own distinct PAT and all resulting ActivityEvents should be tagged with the correct account identifier.

**Validates: Requirements 1.1, 1.2**

### Property 2: Graceful Account Failure Handling

*For any* set of accounts where some have invalid or expired PATs, the system should post notifications for failed accounts to Slack and continue processing all remaining valid accounts.

**Validates: Requirements 1.3**

### Property 3: Activity Event Normalization Completeness

*For any* Figma API response (version or comment), the Activity_Normalizer should transform it into an ActivityEvent containing all required fields: timestamp, account identifier, project information, file information, action type, and deep link URL.

**Validates: Requirements 2.1, 2.2**

### Property 4: Deep Link Format Correctness

*For any* ActivityEvent, the generated deep link URL should follow the correct format based on event type: version links include `?version-id=`, comment links include `?comment-id=`, and all parameters should be URL-encoded.

**Validates: Requirements 2.4, 2.5, 11.1, 11.2, 11.3, 11.4**

### Property 5: Timestamp-Based Event Filtering

*For any* collection of events with various timestamps, when filtering by a "since" timestamp, only events with timestamps after the "since" value should be included in the result.

**Validates: Requirements 3.1**

### Property 6: Digest Timestamp Persistence

*For any* successful digest execution, the completion timestamp should be persisted to storage and retrievable for the next digest run.

**Validates: Requirements 3.3**

### Property 7: ISO 8601 Timestamp Consistency

*For any* timestamp used in the system (event timestamps, digest timestamps, expiration dates), it should be in valid ISO 8601 format.

**Validates: Requirements 3.4**

### Property 8: Slack Message Format Compliance

*For any* ActivityEvent posted to Slack as an individual message, the format should match the pattern: `[FIGMA][account] timestamp – project • user – action "file" url`.

**Validates: Requirements 4.2**

### Property 9: Daily Recap Completeness

*For any* set of events in a daily recap, the summary should include per-person activity counts, per-project activity counts, and total event counts.

**Validates: Requirements 4.3, 8.1, 8.2, 8.3, 8.4**

### Property 10: Webhook Retry Logic

*For any* failed Slack webhook request, the system should retry up to 3 times with exponential backoff before giving up.

**Validates: Requirements 4.4**

### Property 11: Multi-User Activity Aggregation

*For any* digest execution, when multiple users have configured accounts, the system should collect activity from all users' accounts and aggregate them into a single digest.

**Validates: Requirements 5.2, 5.6**

### Property 12: Slack Posting After Collection

*For any* digest execution where activity collection completes successfully, the system should post the results to Slack.

**Validates: Requirements 5.3**

### Property 13: Rate Limit Backoff Compliance

*For any* Figma API request that returns a rate limit error with a Retry-After header, the Figma_Client should wait for the specified duration before retrying.

**Validates: Requirements 6.5**

### Property 14: Descriptive API Error Handling

*For any* failed Figma API request, the Figma_Client should throw an error containing the HTTP status code and response body.

**Validates: Requirements 6.6**

### Property 15: Sensitive Data Redaction

*For any* error message or log entry, PATs and webhook URLs should not appear in plain text.

**Validates: Requirements 7.4**

### Property 16: Comprehensive Error Logging

*For any* error that occurs during processing, the system should log the error with timestamp, component name, stack trace, and context about which accounts or operations succeeded.

**Validates: Requirements 10.1, 10.2, 10.3**

### Property 17: Error Classification

*For any* error encountered, the system should classify it as either recoverable (retry) or fatal (abort) and handle it accordingly.

**Validates: Requirements 10.4**

### Property 18: Unknown Action Type Preservation

*For any* Figma event with an action type not explicitly mapped, the system should preserve the original action type string rather than discarding it.

**Validates: Requirements 12.4**

### Property 19: PAT Validation Before Storage

*For any* PAT submitted by a user, the system should validate it by making a test Figma API call before storing it.

**Validates: Requirements 13.4**

### Property 20: User-Scoped PAT Storage

*For any* PAT stored in the system, it should be associated with the user who added it, and users should only be able to access their own PATs.

**Validates: Requirements 13.5, 15.3**

### Property 21: PAT Deletion Completeness

*For any* account removal request, the system should delete the associated PAT from storage and it should not be retrievable afterward.

**Validates: Requirements 13.6**

### Property 22: PAT Encryption at Rest

*For any* PAT stored in the database, it should be encrypted and the encrypted value should not be reversible without the encryption key.

**Validates: Requirements 13.7**

### Property 23: Multi-Account Per User Support

*For any* user, the system should allow them to configure multiple Figma accounts with distinct account names.

**Validates: Requirements 13.8**

### Property 24: PAT Expiration Extraction

*For any* Figma API response containing user information, the system should attempt to extract the PAT expiration date if present.

**Validates: Requirements 14.1**

### Property 25: Expiration Warning Threshold

*For any* PAT with an expiration date within 3 days, the system should post a warning message to Slack during the next digest run.

**Validates: Requirements 14.2**

### Property 26: Expired PAT Notification

*For any* PAT that has already expired, the system should post an urgent notification to Slack with renewal instructions.

**Validates: Requirements 14.3**

### Property 27: Expiration Check Integration

*For any* digest execution, the system should check PAT expiration status for all configured accounts.

**Validates: Requirements 14.4**

### Property 28: Expiration Notification Content

*For any* PAT expiration warning or notification, the message should include the user name, account name, and expiration date.

**Validates: Requirements 14.5**

### Property 29: Expiration Notification Consolidation

*For any* digest execution where multiple PATs are expiring, the system should consolidate all warnings into a single Slack message rather than posting separate messages.

**Validates: Requirements 14.6**

### Property 30: Authorization Enforcement

*For any* attempt by a user to access another user's PATs, the system should deny access and return an authorization error.

**Validates: Requirements 15.4**

## Error Handling

### Error Categories

1. **Recoverable Errors** (retry with backoff):
   - Figma API rate limits (429)
   - Figma API temporary failures (5xx)
   - Slack webhook temporary failures (5xx)
   - Network timeouts

2. **Fatal Errors** (abort operation):
   - Invalid PAT (401, 403)
   - Missing required configuration
   - Storage failures
   - Invalid data format

3. **Partial Failures** (continue with remaining):
   - Single account PAT failure
   - Single file processing failure
   - Individual event normalization failure

### Error Handling Strategies

**Figma API Errors**:
```typescript
try {
  const response = await fetch(url, options);
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    await sleep(parseInt(retryAfter) * 1000);
    return retry();
  }
  if (response.status >= 500) {
    throw new RecoverableError('Figma API temporary failure');
  }
  if (response.status === 401 || response.status === 403) {
    throw new FatalError('Invalid PAT', { accountName });
  }
} catch (error) {
  logger.error('Figma API request failed', {
    url,
    status: response?.status,
    body: await response?.text(),
    accountName,
  });
  throw error;
}
```

**Slack Webhook Errors**:
```typescript
async function postWithRetry(message: SlackMessage, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      
      if (response.ok) return;
      
      if (response.status >= 500 && i < attempts - 1) {
        await sleep(Math.pow(2, i) * 1000);  // Exponential backoff
        continue;
      }
      
      throw new Error(`Slack webhook failed: ${response.status}`);
    } catch (error) {
      if (i === attempts - 1) throw error;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

**Multi-Account Processing**:
```typescript
async function processAllAccounts(accounts: Account[]): Promise<DigestResult> {
  const results: AccountResult[] = [];
  const errors: Error[] = [];
  
  for (const account of accounts) {
    try {
      const events = await processAccount(account);
      results.push({ account: account.accountName, events });
    } catch (error) {
      logger.error('Account processing failed', {
        accountName: account.accountName,
        error: error.message,
        stack: error.stack,
      });
      errors.push(error);
      // Continue with next account
    }
  }
  
  return { results, errors };
}
```

### Logging Standards

All log entries must include:
- ISO 8601 timestamp
- Log level (ERROR, WARN, INFO, DEBUG)
- Component name
- Operation context
- Sanitized data (no PATs or webhook URLs)

Example log format:
```json
{
  "timestamp": "2026-02-26T09:03:45.123Z",
  "level": "ERROR",
  "component": "FigmaClient",
  "operation": "listFileVersions",
  "accountName": "gen",
  "fileKey": "abc123",
  "error": {
    "message": "API request failed",
    "status": 429,
    "retryAfter": 60
  }
}
```

## Testing Strategy

### Dual Testing Approach

The system requires both unit tests and property-based tests for comprehensive coverage:

**Unit Tests** focus on:
- Specific examples of correct behavior
- Edge cases (missing data, empty responses)
- Integration points between components
- Error conditions and failure modes
- Configuration validation

**Property-Based Tests** focus on:
- Universal properties that hold for all inputs
- Data transformation correctness
- Format compliance across random inputs
- Invariants that must be maintained

### Property-Based Testing Configuration

**Library**: Use `fast-check` for TypeScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test must reference its design document property
- Tag format: `Feature: figma-slack-aggregator, Property {number}: {property_text}`

**Example Property Test**:
```typescript
import fc from 'fast-check';

// Feature: figma-slack-aggregator, Property 3: Activity Event Normalization Completeness
describe('Activity Event Normalization', () => {
  it('should transform any Figma version into complete ActivityEvent', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.string(),
          created_at: fc.date().map(d => d.toISOString()),
          label: fc.string(),
          user: fc.record({
            id: fc.string(),
            handle: fc.string(),
            img_url: fc.webUrl(),
          }),
        }),
        fc.record({
          key: fc.string(),
          name: fc.string(),
        }),
        fc.record({
          id: fc.string(),
          name: fc.string(),
        }),
        fc.constantFrom('gen', 'clientA', 'clientB'),
        (version, file, project, account) => {
          const event = ActivityNormalizer.normalizeVersion(
            version,
            file,
            project,
            account
          );
          
          // Verify all required fields are present
          expect(event.ts).toBeDefined();
          expect(event.account).toBe(account);
          expect(event.projectId).toBe(project.id);
          expect(event.projectName).toBe(project.name);
          expect(event.fileKey).toBe(file.key);
          expect(event.fileName).toBe(file.name);
          expect(event.action).toBe('FILE_VERSION_CREATED');
          expect(event.url).toMatch(/^https:\/\/www\.figma\.com\/file\//);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Unit Test Examples

**Edge Case Testing**:
```typescript
describe('Activity Normalizer Edge Cases', () => {
  it('should handle missing user information', () => {
    const version = {
      id: 'v1',
      created_at: '2026-02-26T09:00:00Z',
      label: 'Test',
      user: null,  // Missing user
    };
    
    const event = ActivityNormalizer.normalizeVersion(version, file, project, 'gen');
    
    expect(event.userId).toBeUndefined();
    expect(event.userName).toBeUndefined();
    expect(event.userEmail).toBeUndefined();
  });
  
  it('should handle missing file keys', () => {
    const version = { ...validVersion };
    const file = { key: null, name: 'Test' };
    
    const event = ActivityNormalizer.normalizeVersion(version, file, project, 'gen');
    
    expect(event.url).toBeUndefined();
  });
});
```

**Integration Testing**:
```typescript
describe('Digest Endpoint Integration', () => {
  it('should process multiple accounts and post to Slack', async () => {
    // Setup test accounts
    await storage.saveUserAccount({
      userId: 'user1',
      accountName: 'test-account',
      encryptedPAT: storage.encryptPAT('test-pat'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    
    // Mock Figma API responses
    mockFigmaAPI.mockVersions([...]);
    
    // Mock Slack webhook
    const slackMock = jest.fn();
    mockSlackWebhook(slackMock);
    
    // Trigger digest
    const response = await fetch('/api/run-figma-digest');
    
    expect(response.status).toBe(200);
    expect(slackMock).toHaveBeenCalled();
    
    const body = await response.json();
    expect(body.eventsProcessed).toBeGreaterThan(0);
  });
});
```

### Test Coverage Goals

- **Unit Test Coverage**: 80%+ of lines
- **Property Test Coverage**: All 30 correctness properties
- **Integration Test Coverage**: All API endpoints and critical paths
- **Edge Case Coverage**: All identified edge cases from prework

### Testing Phases

**Phase 1 - MVP (Polling)**:
- Focus on core properties (1-12)
- Test Figma API client thoroughly
- Test activity normalization
- Test Slack posting with stub endpoint

**Phase 2 - Real Slack Integration**:
- Add properties for webhook retry logic
- Test error handling and logging
- Test multi-account processing

**Phase 3 - PAT Management**:
- Add properties for authentication and authorization (20, 30)
- Test PAT encryption and storage (21, 22)
- Test expiration monitoring (24-29)

**Phase 4 - Real-time Webhooks**:
- Add properties for webhook event handling
- Test event deduplication
- Test real-time vs polling consistency

## Implementation Notes

### Vercel Deployment Considerations

**Timeout Management**:
- Hobby plan: 10 second limit
- Pro plan: 60 second limit (configurable)
- Implement pagination if processing exceeds limits
- Consider breaking digest into multiple invocations for large datasets

**Cold Start Optimization**:
- Minimize dependencies
- Use dynamic imports for heavy libraries
- Cache Figma API responses when possible
- Keep function bundle size under 50MB

**Environment Variables**:
```typescript
// vercel.json
{
  "env": {
    "SLACK_WEBHOOK_URL": "@slack-webhook-url",
    "ENCRYPTION_KEY": "@encryption-key",
    "NEXTAUTH_SECRET": "@nextauth-secret"
  }
}
```

### Security Best Practices

1. **PAT Storage**:
   - Use AES-256-GCM encryption
   - Rotate encryption keys periodically
   - Never log decrypted PATs
   - Use Vercel KV's built-in TLS

2. **Authentication**:
   - Implement CSRF protection
   - Use secure session cookies (httpOnly, secure, sameSite)
   - Implement rate limiting on auth endpoints
   - Optional: Email whitelist for access control

3. **API Security**:
   - Validate all user inputs
   - Sanitize data before logging
   - Use environment variables for secrets
   - Implement request signing for digest endpoint

### Performance Optimization

**Parallel Processing**:
```typescript
// Process accounts in parallel with concurrency limit
async function processAccountsParallel(
  accounts: Account[],
  concurrency: number = 3
): Promise<DigestResult> {
  const chunks = chunk(accounts, concurrency);
  const results: AccountResult[] = [];
  
  for (const chunk of chunks) {
    const chunkResults = await Promise.allSettled(
      chunk.map(account => processAccount(account))
    );
    results.push(...chunkResults.filter(r => r.status === 'fulfilled'));
  }
  
  return { results, errors: [] };
}
```

**Caching Strategy**:
- Cache team IDs per PAT (1 hour TTL)
- Cache project lists per team (5 minute TTL)
- Cache file metadata (1 minute TTL)
- Use Vercel KV for distributed caching

**Rate Limit Management**:
- Track API calls per PAT
- Implement token bucket algorithm
- Respect Figma's rate limits (varies by plan)
- Distribute requests across time window

### Future Enhancements

**Phase 3 - Time Estimation**:
- Cluster file versions into work sessions
- Infer effort based on session duration and activity type
- Generate time reports per project/user
- Add `/api/time-report` endpoint

**Phase 4 - Real-time Webhooks**:
- Implement `/api/figma-webhook` endpoint
- Verify webhook signatures
- Deduplicate events (webhook + polling)
- Store webhook events in queue for processing
- Fallback to polling if webhooks fail

**Additional Features**:
- Email notifications for PAT expiration
- Dashboard for activity visualization
- Export activity data to CSV
- Custom Slack message formatting per user
- Activity filtering by project/user
- Scheduled digest times per user

# Implementation Plan: Figma-to-Slack Activity Aggregator

## Overview

This implementation plan breaks down the Figma-to-Slack Activity Aggregator into discrete coding tasks. The system is built as a Node.js/TypeScript serverless application on Vercel that collects activity from multiple Figma accounts and posts summaries to Slack.

The implementation follows a phased approach:
- **Phase 1**: Core polling infrastructure with stub Slack endpoint
- **Phase 2**: User authentication and PAT management
- **Phase 3**: Real Slack integration and PAT expiration monitoring
- **Phase 4**: Production deployment and monitoring

## Tasks

- [x] 1. Project setup and infrastructure
  - Initialize Next.js project with TypeScript
  - Configure Vercel deployment settings
  - Set up Vercel KV storage
  - Configure environment variables
  - Set up testing framework (Jest + fast-check)
  - _Requirements: 7.1, 7.3, 9.1_

- [x] 2. Implement storage layer with encryption
  - [x] 2.1 Create storage interface and Vercel KV client
    - Implement `Storage` class with KV connection
    - Define storage key patterns for users, accounts, and digest state
    - _Requirements: 7.1, 13.5_
  
  - [x] 2.2 Implement PAT encryption and decryption
    - Use AES-256-GCM encryption with environment variable key
    - Generate unique IV for each encrypted value
    - _Requirements: 13.7_
  
  - [x] 2.3 Implement user account CRUD operations
    - `saveUserAccount`, `getUserAccounts`, `getAllUserAccounts`, `deleteUserAccount`
    - _Requirements: 13.5, 13.6, 13.8_
  
  - [x] 2.4 Implement digest state management
    - `getLastDigestTime`, `updateLastDigestTime`
    - _Requirements: 3.1, 3.3_
  
  - [ ]* 2.5 Write property test for PAT encryption
    - **Property 22: PAT Encryption at Rest**
    - **Validates: Requirements 13.7**
  
  - [ ]* 2.6 Write property test for PAT deletion
    - **Property 21: PAT Deletion Completeness**
    - **Validates: Requirements 13.6**
  
  - [ ]* 2.7 Write property test for user-scoped storage
    - **Property 20: User-Scoped PAT Storage**
    - **Validates: Requirements 13.5, 15.3**

- [x] 3. Implement Figma API client
  - [x] 3.1 Create FigmaClient class with authentication
    - Implement constructor with PAT and account name
    - Set up HTTP client with proper headers
    - _Requirements: 1.1, 6.1, 6.2, 6.3, 6.4_
  
  - [x] 3.2 Implement core API methods
    - `getMe()` - Get user info and team IDs
    - `listTeamProjects(teamId)` - List projects for a team
    - `listProjectFiles(projectId)` - List files in a project
    - `listFileVersions(fileKey, options)` - Get file versions with pagination
    - `listFileComments(fileKey)` - Get comments on a file
    - `getFileMeta(fileKey)` - Get file metadata
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  
  - [x] 3.3 Implement rate limit handling
    - Respect Retry-After headers
    - Implement exponential backoff for 429 responses
    - _Requirements: 6.5_
  
  - [x] 3.4 Implement error handling
    - Throw descriptive errors with status codes and response bodies
    - Classify errors as recoverable vs fatal
    - _Requirements: 6.6, 10.4_
  
  - [ ]* 3.5 Write property test for rate limit backoff
    - **Property 13: Rate Limit Backoff Compliance**
    - **Validates: Requirements 6.5**
  
  - [ ]* 3.6 Write property test for API error handling
    - **Property 14: Descriptive API Error Handling**
    - **Validates: Requirements 6.6**
  
  - [ ]* 3.7 Write unit tests for Figma client methods
    - Test each API method with mock responses
    - Test error conditions and edge cases

- [x] 4. Implement activity normalization
  - [x] 4.1 Create ActivityNormalizer class
    - Define ActivityEvent interface
    - Implement `normalizeVersion` method
    - Implement `normalizeComment` method
    - _Requirements: 2.1, 2.2, 12.1, 12.2_
  
  - [x] 4.2 Implement deep link generation
    - `generateDeepLink` method with version, comment, and base file support
    - URL-encode all parameters
    - _Requirements: 2.4, 2.5, 11.1, 11.2, 11.3, 11.4_
  
  - [x] 4.3 Implement timestamp filtering
    - `filterByTimestamp` method
    - Ensure ISO 8601 format compliance
    - _Requirements: 3.1, 3.4_
  
  - [x] 4.4 Implement action type classification
    - Map Figma events to action types
    - Preserve unknown action types
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [ ]* 4.5 Write property test for normalization completeness
    - **Property 3: Activity Event Normalization Completeness**
    - **Validates: Requirements 2.1, 2.2**
  
  - [ ]* 4.6 Write property test for deep link format
    - **Property 4: Deep Link Format Correctness**
    - **Validates: Requirements 2.4, 2.5, 11.1, 11.2, 11.3, 11.4**
  
  - [ ]* 4.7 Write property test for timestamp filtering
    - **Property 5: Timestamp-Based Event Filtering**
    - **Validates: Requirements 3.1**
  
  - [ ]* 4.8 Write property test for ISO 8601 compliance
    - **Property 7: ISO 8601 Timestamp Consistency**
    - **Validates: Requirements 3.4**
  
  - [ ]* 4.9 Write property test for unknown action type preservation
    - **Property 18: Unknown Action Type Preservation**
    - **Validates: Requirements 12.4**
  
  - [ ]* 4.10 Write unit tests for edge cases
    - Test missing user information
    - Test missing file keys
    - Test empty responses

- [x] 5. Checkpoint - Core data layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement summary generation
  - [x] 6.1 Create SummaryGenerator class
    - Implement `generatePerEventSummaries` method
    - Implement `generateDailyRecap` method
    - _Requirements: 4.2, 4.3, 8.1, 8.2, 8.3, 8.4_
  
  - [x] 6.2 Implement event grouping and counting
    - `groupEvents` method (by user, project, account)
    - `countByAction` method
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ]* 6.3 Write property test for message format compliance
    - **Property 8: Slack Message Format Compliance**
    - **Validates: Requirements 4.2**
  
  - [ ]* 6.4 Write property test for daily recap completeness
    - **Property 9: Daily Recap Completeness**
    - **Validates: Requirements 4.3, 8.1, 8.2, 8.3, 8.4**
  
  - [ ]* 6.5 Write unit tests for summary generation
    - Test per-event format with various inputs
    - Test daily recap with multiple users/projects

- [x] 7. Implement Slack poster with retry logic
  - [x] 7.1 Create SlackPoster class
    - Implement constructor with webhook URL
    - Implement `postMessage` method
    - Implement `postMessages` with rate limiting (1 msg/sec)
    - _Requirements: 4.1, 4.4_
  
  - [x] 7.2 Implement retry logic with exponential backoff
    - Retry up to 3 times on failure
    - Exponential backoff: 1s, 2s, 4s
    - _Requirements: 4.4_
  
  - [x] 7.3 Implement PAT expiration warning messages
    - `postPATWarning` method
    - Format warnings with user, account, and expiration info
    - _Requirements: 14.2, 14.3, 14.5_
  
  - [ ]* 7.4 Write property test for webhook retry logic
    - **Property 10: Webhook Retry Logic**
    - **Validates: Requirements 4.4**
  
  - [ ]* 7.5 Write unit tests for Slack posting
    - Test successful posting
    - Test retry on failure
    - Test rate limiting

- [x] 8. Implement PAT monitoring
  - [x] 8.1 Create PATMonitor class
    - Implement `checkPATExpiration` method
    - Implement `checkAllPATs` method
    - Implement `extractExpiration` static method
    - _Requirements: 14.1, 14.2, 14.3, 14.4_
  
  - [x] 8.2 Implement expiration warning logic
    - Check for PATs expiring within 3 days
    - Check for already expired PATs
    - Consolidate multiple warnings into single message
    - _Requirements: 14.2, 14.3, 14.6_
  
  - [ ]* 8.3 Write property test for expiration extraction
    - **Property 24: PAT Expiration Extraction**
    - **Validates: Requirements 14.1**
  
  - [ ]* 8.4 Write property test for warning threshold
    - **Property 25: Expiration Warning Threshold**
    - **Validates: Requirements 14.2**
  
  - [ ]* 8.5 Write property test for expired PAT notification
    - **Property 26: Expired PAT Notification**
    - **Validates: Requirements 14.3**
  
  - [ ]* 8.6 Write property test for notification consolidation
    - **Property 29: Expiration Notification Consolidation**
    - **Validates: Requirements 14.6**

- [x] 9. Implement digest endpoint
  - [x] 9.1 Create `/api/run-figma-digest` API route
    - Set up Next.js API route handler
    - Define DigestResponse interface
    - _Requirements: 5.1, 5.4, 5.5_
  
  - [x] 9.2 Implement digest orchestration logic
    - Retrieve all user accounts from storage
    - Process each account in parallel (with concurrency limit)
    - Handle account failures gracefully
    - _Requirements: 5.2, 5.6, 1.3_
  
  - [x] 9.3 Implement activity collection per account
    - Decrypt PAT
    - Create FigmaClient
    - Fetch teams, projects, files
    - Fetch versions and comments since last digest
    - Normalize events
    - _Requirements: 1.1, 1.2, 3.1_
  
  - [x] 9.4 Implement PAT expiration checking
    - Check expiration for all PATs during digest
    - Generate warnings for expiring/expired PATs
    - _Requirements: 14.4, 14.5_
  
  - [x] 9.5 Implement summary generation and Slack posting
    - Aggregate events from all accounts
    - Generate summaries
    - Post to Slack
    - _Requirements: 4.1, 5.3_
  
  - [x] 9.6 Implement digest state updates
    - Update last digest timestamp for each account
    - Log summary statistics
    - _Requirements: 3.3, 10.5_
  
  - [ ]* 9.7 Write property test for multi-account PAT isolation
    - **Property 1: Multi-Account PAT Isolation**
    - **Validates: Requirements 1.1, 1.2**
  
  - [ ]* 9.8 Write property test for graceful failure handling
    - **Property 2: Graceful Account Failure Handling**
    - **Validates: Requirements 1.3**
  
  - [ ]* 9.9 Write property test for multi-user aggregation
    - **Property 11: Multi-User Activity Aggregation**
    - **Validates: Requirements 5.2, 5.6**
  
  - [ ]* 9.10 Write property test for Slack posting after collection
    - **Property 12: Slack Posting After Collection**
    - **Validates: Requirements 5.3**
  
  - [ ]* 9.11 Write property test for digest timestamp persistence
    - **Property 6: Digest Timestamp Persistence**
    - **Validates: Requirements 3.3**
  
  - [ ]* 9.12 Write integration tests for digest endpoint
    - Test full digest flow with mock Figma API
    - Test error handling and partial failures
    - Test response format

- [x] 10. Checkpoint - Core digest functionality complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement authentication system
  - [x] 11.1 Set up NextAuth.js
    - Install and configure NextAuth.js
    - Create `/api/auth/[...nextauth].ts` route
    - Configure magic link provider
    - _Requirements: 15.1, 15.2_
  
  - [x] 11.2 Configure session storage
    - Use Vercel KV for session storage
    - Set secure cookie options
    - _Requirements: 15.6_
  
  - [x] 11.3 Implement optional email whitelist
    - Check ALLOWED_EMAILS environment variable
    - Restrict access to whitelisted emails
    - _Requirements: 15.1_
  
  - [ ]* 11.4 Write unit tests for authentication
    - Test successful login
    - Test email whitelist enforcement
    - Test session expiration

- [x] 12. Implement configuration interface
  - [x] 12.1 Create `/config` page
    - Build Next.js page with authentication guard
    - Display user's configured accounts
    - Show masked PAT values (last 4 chars)
    - Show PAT expiration status
    - _Requirements: 13.1, 13.2, 13.3_
  
  - [x] 12.2 Create account management form
    - Add account form with PAT input
    - Update account form
    - Delete account button
    - _Requirements: 13.1, 13.4, 13.6_
  
  - [x] 12.3 Implement `/api/config/accounts` endpoints
    - GET - List user's accounts
    - POST - Add new account with validation
    - DELETE - Remove account
    - _Requirements: 13.3, 13.4, 13.5, 13.6_
  
  - [x] 12.4 Implement PAT validation
    - Make test Figma API call before storing
    - Return validation errors to user
    - _Requirements: 13.4_
  
  - [ ]* 12.5 Write property test for PAT validation
    - **Property 19: PAT Validation Before Storage**
    - **Validates: Requirements 13.4**
  
  - [ ]* 12.6 Write property test for multi-account support
    - **Property 23: Multi-Account Per User Support**
    - **Validates: Requirements 13.8**
  
  - [ ]* 12.7 Write property test for authorization enforcement
    - **Property 30: Authorization Enforcement**
    - **Validates: Requirements 15.4**
  
  - [ ]* 12.8 Write integration tests for config interface
    - Test account CRUD operations
    - Test authorization (users can only see their own accounts)
    - Test PAT validation flow

- [x] 13. Implement comprehensive error logging
  - [x] 13.1 Create logging utility
    - Implement structured logging with JSON format
    - Include timestamp, level, component, operation
    - Sanitize sensitive data (PATs, webhook URLs)
    - _Requirements: 10.1, 10.2, 10.3, 7.4_
  
  - [x] 13.2 Add logging to all components
    - Log errors with full context
    - Log successful operations with summary stats
    - Log partial failures with details
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [x] 13.3 Implement error classification
    - Classify errors as recoverable vs fatal
    - Log classification with error details
    - _Requirements: 10.4_
  
  - [ ]* 13.4 Write property test for sensitive data redaction
    - **Property 15: Sensitive Data Redaction**
    - **Validates: Requirements 7.4**
  
  - [ ]* 13.5 Write property test for comprehensive error logging
    - **Property 16: Comprehensive Error Logging**
    - **Validates: Requirements 10.1, 10.2, 10.3**
  
  - [ ]* 13.6 Write property test for error classification
    - **Property 17: Error Classification**
    - **Validates: Requirements 10.4**

- [x] 14. Implement expiration check integration
  - [x] 14.1 Integrate PAT monitoring into digest flow
    - Call PATMonitor.checkAllPATs() during digest
    - Post consolidated warnings to Slack
    - _Requirements: 14.4, 14.6_
  
  - [ ]* 14.2 Write property test for expiration check integration
    - **Property 27: Expiration Check Integration**
    - **Validates: Requirements 14.4**
  
  - [ ]* 14.3 Write property test for notification content
    - **Property 28: Expiration Notification Content**
    - **Validates: Requirements 14.5**

- [x] 15. Configure Vercel deployment
  - [x] 15.1 Create vercel.json configuration
    - Configure environment variables
    - Set function timeout limits
    - Configure KV storage
    - _Requirements: 9.1, 9.2_
  
  - [x] 15.2 Set up Vercel KV database
    - Create KV database in Vercel dashboard
    - Link to project
    - _Requirements: 7.1_
  
  - [x] 15.3 Configure cron job for digest
    - Set up Vercel cron to trigger `/api/run-figma-digest`
    - Configure schedule (e.g., hourly, daily)
    - _Requirements: 5.1_
  
  - [x] 15.4 Set up environment variables in Vercel
    - Add SLACK_WEBHOOK_URL
    - Add ENCRYPTION_KEY
    - Add NEXTAUTH_SECRET and NEXTAUTH_URL
    - Add KV connection strings
    - _Requirements: 7.1, 7.3_

- [x] 16. Create documentation
  - [x] 16.1 Write README with setup instructions
    - Document environment variables
    - Document deployment steps
    - Document PAT creation in Figma
    - Document Slack webhook setup
  
  - [x] 16.2 Write user guide for configuration interface
    - How to add Figma accounts
    - How to manage PATs
    - How to interpret Slack messages
  
  - [x] 16.3 Write developer documentation
    - Architecture overview
    - Component descriptions
    - Testing guide
    - Troubleshooting guide

- [x] 17. Final checkpoint - Production readiness
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation follows a phased approach: core functionality → authentication → production deployment

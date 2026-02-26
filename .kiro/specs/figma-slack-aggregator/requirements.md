# Requirements Document

## Introduction

This document specifies the requirements for a Figma-to-Slack Activity Aggregator, a backend application that collects activity from multiple Figma workspaces and posts aggregated summaries to Slack for indexing by Glean. The system addresses the limitation that Figma's native Slack app only supports one account per Slack workspace, enabling users to track work across multiple Figma accounts in a single searchable location.

## Glossary

- **System**: The Figma-to-Slack Activity Aggregator application
- **Figma_Client**: Component responsible for interacting with Figma REST APIs
- **Activity_Normalizer**: Component that transforms Figma API responses into standardized ActivityEvent objects
- **Summary_Generator**: Component that aggregates ActivityEvents into human-readable summaries
- **Slack_Poster**: Component that sends formatted messages to Slack via webhook
- **Digest_Endpoint**: API route that triggers the activity collection and posting process
- **Config_Interface**: Web interface for managing Figma PATs and account configuration
- **PAT_Monitor**: Component that checks PAT expiration status and sends notifications
- **Auth_System**: Component that handles user authentication and authorization
- **Storage**: Persistent storage system for user PATs and application state
- **ActivityEvent**: Normalized data structure representing a single Figma activity
- **Account**: A specific Figma workspace identified by a unique Personal Access Token (PAT)
- **PAT**: Personal Access Token used to authenticate with Figma APIs - shows activity from all users in files the PAT owner can access
- **User**: An individual who configures their own Figma PATs in the system
- **Webhook**: HTTP endpoint that receives POST requests with event data
- **Glean**: Search and knowledge management system that indexes Slack messages

## Requirements

### Requirement 1: Multi-Account Figma Activity Collection

**User Story:** As a user working across multiple Figma accounts, I want the system to collect activity from all my accounts, so that I have a complete view of my work regardless of which account I'm using.

#### Acceptance Criteria

1. WHEN the System polls Figma APIs, THE System SHALL authenticate using separate PATs for each configured account
2. WHEN collecting activity, THE System SHALL tag each ActivityEvent with its source account identifier
3. WHEN a PAT is invalid or expired, THE System SHALL post a notification to Slack and continue processing remaining accounts
4. THE System SHALL support at least three distinct Figma accounts simultaneously
5. WHEN retrieving activity data, THE System SHALL use read-only API scopes exclusively

### Requirement 2: Activity Event Normalization

**User Story:** As a developer, I want all Figma activity normalized into a consistent format, so that downstream components can process events uniformly regardless of their source API.

#### Acceptance Criteria

1. WHEN the System receives Figma API responses, THE Activity_Normalizer SHALL transform them into ActivityEvent objects
2. THE ActivityEvent SHALL include timestamp, account identifier, project information, file information, user information, action type, and deep link URL
3. WHEN user information is unavailable, THE Activity_Normalizer SHALL populate user fields with null values
4. WHEN normalizing file version events, THE Activity_Normalizer SHALL generate deep links to the specific version
5. WHEN normalizing comment events, THE Activity_Normalizer SHALL generate deep links to the specific comment

### Requirement 3: Time-Based Activity Filtering

**User Story:** As a user, I want to retrieve only new activity since the last digest, so that I don't see duplicate events in Slack.

#### Acceptance Criteria

1. WHEN collecting activity, THE System SHALL filter events to include only those after the last successful digest timestamp
2. WHEN no previous digest timestamp exists, THE System SHALL collect activity from the past 24 hours
3. WHEN a digest completes successfully, THE System SHALL persist the completion timestamp for future filtering
4. THE System SHALL use ISO 8601 format for all timestamp comparisons

### Requirement 4: Slack Message Posting

**User Story:** As a user, I want activity summaries posted to Slack, so that I can search my work history using Glean.

#### Acceptance Criteria

1. WHEN the Digest_Endpoint is triggered, THE Slack_Poster SHALL send formatted messages to the configured webhook URL
2. WHEN posting individual events, THE Slack_Poster SHALL format messages as: `[FIGMA][account] timestamp – project • user – action "file" url`
3. WHEN posting daily recaps, THE Slack_Poster SHALL include per-person and per-project breakdowns
4. WHEN the webhook request fails, THE System SHALL retry up to 3 times with exponential backoff
5. WHEN all retry attempts fail, THE System SHALL log the error and return a failure status

### Requirement 5: API Endpoint for Digest Triggering

**User Story:** As a system administrator, I want an API endpoint to trigger digest generation, so that I can schedule regular activity collection via cron or manual invocation.

#### Acceptance Criteria

1. THE System SHALL expose an API route at `/api/run-figma-digest`
2. WHEN the Digest_Endpoint receives a request, THE System SHALL collect activity from all configured accounts across all users
3. WHEN activity collection completes, THE System SHALL post results to Slack
4. WHEN the digest process completes, THE System SHALL return HTTP 200 with a summary of events processed
5. WHEN the digest process fails, THE System SHALL return HTTP 500 with error details
6. THE System SHALL aggregate activity from all users into a single digest per execution

### Requirement 6: Figma API Integration

**User Story:** As a developer, I want a client wrapper for Figma APIs, so that I can reliably fetch projects, files, versions, and comments.

#### Acceptance Criteria

1. THE Figma_Client SHALL support listing projects for a given account
2. THE Figma_Client SHALL support listing files within a project
3. THE Figma_Client SHALL support listing file versions with timestamps
4. THE Figma_Client SHALL support listing comments on a file
5. WHEN API rate limits are encountered, THE Figma_Client SHALL respect retry-after headers and backoff appropriately
6. WHEN API requests fail, THE Figma_Client SHALL throw descriptive errors including status codes and response bodies

### Requirement 7: Environment-Based Configuration

**User Story:** As a system administrator, I want configuration managed through environment variables, so that I can deploy the system securely without hardcoding credentials.

#### Acceptance Criteria

1. THE System SHALL read the Slack webhook URL from the `SLACK_WEBHOOK_URL` environment variable
2. THE System SHALL read Figma PATs from environment variables named `FIGMA_TOKEN_{ACCOUNT_NAME}`
3. WHEN a required environment variable is missing, THE System SHALL fail startup with a descriptive error
4. THE System SHALL NOT log or expose PATs or webhook URLs in error messages or responses
5. WHERE optional state storage is configured, THE System SHALL read storage credentials from environment variables

### Requirement 8: Activity Summary Generation

**User Story:** As a user, I want activity aggregated into readable summaries, so that I can quickly understand what happened across all my accounts.

#### Acceptance Criteria

1. WHEN generating summaries, THE Summary_Generator SHALL group events by date
2. WHEN generating summaries, THE Summary_Generator SHALL provide per-person activity counts
3. WHEN generating summaries, THE Summary_Generator SHALL provide per-project activity counts
4. WHEN generating summaries, THE Summary_Generator SHALL include total event counts
5. THE Summary_Generator SHALL format summaries as multi-line text suitable for Slack messages

### Requirement 9: Serverless Deployment Compatibility

**User Story:** As a developer, I want the system to run on Vercel serverless functions, so that I can deploy without managing infrastructure.

#### Acceptance Criteria

1. THE System SHALL implement API routes compatible with Vercel's serverless function format
2. THE System SHALL complete digest processing within Vercel's function timeout limits (10 seconds for hobby, 60 seconds for pro)
3. WHEN processing takes longer than timeout limits, THE System SHALL implement pagination or chunking strategies
4. THE System SHALL use stateless design patterns suitable for serverless execution
5. WHERE state persistence is needed, THE System SHALL use external storage rather than in-memory state

### Requirement 10: Error Handling and Logging

**User Story:** As a system administrator, I want comprehensive error handling and logging, so that I can diagnose issues when the system fails.

#### Acceptance Criteria

1. WHEN errors occur, THE System SHALL log error messages with timestamps, component names, and stack traces
2. WHEN API requests fail, THE System SHALL log the request details and response status
3. WHEN processing continues after an error, THE System SHALL log which accounts or operations succeeded
4. THE System SHALL distinguish between recoverable errors (retry) and fatal errors (abort)
5. WHEN the digest completes, THE System SHALL log summary statistics including event counts and processing duration

### Requirement 11: Deep Link Generation

**User Story:** As a user, I want clickable links in Slack messages, so that I can navigate directly to the relevant Figma content.

#### Acceptance Criteria

1. WHEN generating links for file versions, THE System SHALL construct URLs in the format `https://www.figma.com/file/{fileKey}?version-id={versionId}`
2. WHEN generating links for comments, THE System SHALL construct URLs in the format `https://www.figma.com/file/{fileKey}?comment-id={commentId}`
3. WHEN generating links for files without specific versions or comments, THE System SHALL construct URLs in the format `https://www.figma.com/file/{fileKey}`
4. THE System SHALL URL-encode all parameters in generated links
5. WHEN file keys or IDs are missing, THE System SHALL omit the URL field from the ActivityEvent

### Requirement 12: Action Type Classification

**User Story:** As a user, I want to see what type of activity occurred, so that I can understand the nature of changes without clicking through.

#### Acceptance Criteria

1. THE System SHALL classify file version creation events as `FILE_VERSION_CREATED`
2. THE System SHALL classify comment addition events as `COMMENT_ADDED`
3. THE System SHALL classify library publication events as `LIBRARY_PUBLISHED`
4. WHERE Figma provides additional action types, THE System SHALL preserve the original action type string
5. WHEN action types cannot be determined, THE System SHALL use `UNKNOWN_ACTION` as the default

### Requirement 13: Multi-User PAT Management

**User Story:** As a user, I want to add and manage my own Figma PATs through a web interface, so that the system can track activity from my Figma accounts without requiring developer intervention.

#### Acceptance Criteria

1. THE System SHALL expose a web interface at `/config` for PAT management
2. WHEN a user accesses the configuration interface, THE System SHALL authenticate the user
3. WHEN an authenticated user views their configuration, THE System SHALL display their configured accounts with masked PAT values
4. WHEN a user submits a new PAT, THE System SHALL validate it by making a test API call to Figma
5. WHEN PAT validation succeeds, THE System SHALL store the PAT securely associated with the user's identity
6. WHEN a user removes an account, THE System SHALL delete the associated PAT from storage
7. WHEN storing PATs, THE System SHALL encrypt them at rest
8. THE System SHALL allow each user to configure multiple Figma accounts with distinct account names

### Requirement 14: PAT Expiration Monitoring and Notification

**User Story:** As a user, I want to be notified before my PATs expire, so that I can renew them proactively and avoid service interruptions.

#### Acceptance Criteria

1. WHEN checking PAT validity, THE System SHALL extract expiration dates from Figma API responses
2. WHEN a PAT will expire within 3 days, THE System SHALL post a warning message to Slack mentioning the affected user
3. WHEN a PAT has expired, THE System SHALL post an urgent notification to Slack with instructions for renewal
4. THE System SHALL check PAT expiration status during each digest run
5. THE System SHALL include the user name, account name, and expiration date in notification messages
6. WHEN multiple PATs are expiring, THE System SHALL consolidate notifications into a single message

### Requirement 15: User Authentication and Authorization

**User Story:** As a user, I want secure access to the configuration interface, so that only I can manage my own PATs and other users cannot access my credentials.

#### Acceptance Criteria

1. THE System SHALL implement user authentication for the configuration interface
2. WHEN a user logs in, THE System SHALL verify their identity using a secure authentication method
3. WHEN a user accesses PAT management, THE System SHALL show only their own configured accounts
4. WHEN a user attempts to access another user's PATs, THE System SHALL deny access
5. THE System SHALL support at least OAuth-based authentication or email-based magic links
6. WHEN a user session expires, THE System SHALL require re-authentication


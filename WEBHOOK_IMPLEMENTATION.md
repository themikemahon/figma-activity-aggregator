# Webhook-Based Activity Tracking Implementation

## Overview

The Figma Activity Aggregator now uses a hybrid webhook + daily digest system instead of polling the Figma API. This approach works around the limitation that public OAuth apps cannot access team/project listing endpoints.

## Architecture

### 1. Webhook Event Reception
- **Endpoint**: `/api/webhooks/figma`
- **Purpose**: Receives real-time file update events from Figma
- **Security**: Verifies webhook signatures using `FIGMA_WEBHOOK_SECRET`
- **Storage**: Events stored in Redis with 7-day TTL

### 2. Webhook Registration
- **Endpoint**: `/api/webhooks/register`
- **Purpose**: Registers webhooks with Figma for each team
- **Trigger**: Automatically called when team IDs are added in config UI
- **Scope**: Registers `FILE_UPDATE` events at team level

### 3. Daily Digest Processing
- **Endpoint**: `/api/run-figma-digest`
- **Purpose**: Processes accumulated webhook events and posts to Slack
- **Schedule**: Runs daily via Vercel cron job
- **Filtering**: Only includes events relevant to the authenticated user

## How It Works

### Event Flow

```
Figma File Update
    ↓
Figma Webhook → /api/webhooks/figma
    ↓
Store in Redis (7-day TTL)
    ↓
Daily Cron Job → /api/run-figma-digest
    ↓
Read webhook events from Redis
    ↓
Filter for user relevance
    ↓
Generate summaries with file links
    ↓
Post to Slack
```

### User Relevance Filtering

Events are considered relevant if:
- User created the file version/edit
- User made the comment
- Someone commented on a file the user recently edited
- Someone replied to the user's comment

### Slack Message Format

Messages include clickable file links:
```
[FIGMA][account] timestamp – project • user – action <url|"filename">
```

Example:
```
[FIGMA][mike.mahon@gendigital.com] 2026-02-27 14:30 – GenStudio • John Doe – Updated <https://www.figma.com/file/abc123|"Homepage Design">
```

## Implementation Details

### Storage Schema

**Webhook Events**:
- Key: `webhook:event:{fileKey}:{timestamp}`
- TTL: 7 days
- Contains: eventType, fileKey, fileName, teamId, triggeredBy, timestamp, rawEvent

**Daily Event Index**:
- Key: `webhook:events:{YYYY-MM-DD}`
- Type: Set of event keys
- TTL: 8 days

**Webhook Subscriptions**:
- Key: `webhook:subscription:{webhookId}`
- Contains: webhookId, teamId, userId, accountName, createdAt

**User Webhook Index**:
- Key: `user:{userId}:webhooks`
- Type: Set of webhook IDs

### API Endpoints

#### POST /api/webhooks/figma
Receives webhook events from Figma.

**Headers**:
- `x-figma-signature`: HMAC-SHA256 signature for verification

**Body**: Figma webhook event payload

**Response**: `{ success: true }`

#### POST /api/webhooks/register
Registers a webhook with Figma for a team.

**Authentication**: Requires NextAuth session

**Body**:
```json
{
  "teamId": "1486397302629318522",
  "accountName": "mike.mahon@gendigital.com"
}
```

**Response**:
```json
{
  "success": true,
  "webhookId": "webhook-id-from-figma"
}
```

#### GET /api/run-figma-digest
Processes webhook events and posts to Slack.

**Authentication**: None (called by cron)

**Response**:
```json
{
  "success": true,
  "eventsProcessed": 15,
  "accountsProcessed": 2,
  "errors": [],
  "duration": 1234
}
```

## Configuration

### Environment Variables

Add to Vercel environment variables:

```bash
FIGMA_WEBHOOK_SECRET=your-secret-passphrase
```

Generate a secure secret:
```bash
openssl rand -base64 32
```

### Webhook Registration

Webhooks are automatically registered when:
1. User adds team IDs in the config UI
2. Frontend calls `/api/webhooks/register` for each team

Manual registration (if needed):
```bash
curl -X POST https://your-app.vercel.app/api/webhooks/register \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{"teamId":"1486397302629318522","accountName":"mike.mahon@gendigital.com"}'
```

## Testing

### 1. Test Webhook Reception

Trigger a file update in Figma, then check logs:
```bash
vercel logs --follow
```

Look for: `[FigmaWebhook] Webhook event received`

### 2. Test Webhook Storage

Check Redis for stored events:
```bash
# Via Upstash console or CLI
GET webhook:event:*
```

### 3. Test Digest Processing

Manually trigger digest:
```bash
curl https://your-app.vercel.app/api/run-figma-digest
```

Check Slack for posted messages.

### 4. Test Event Filtering

1. Make changes to a Figma file
2. Have another user comment on your file
3. Run digest
4. Verify both events appear in Slack

## Limitations

### Current Limitations

1. **Project Names**: Webhook events don't include project information, so messages show "Unknown Project"
2. **Historical Data**: Only events after webhook registration are captured
3. **Event Types**: Currently only `FILE_UPDATE` events are registered
4. **Rate Limits**: Figma webhook rate limits apply (not documented)

### Potential Enhancements

1. **LLM Summarization**: Add AI-powered contextual summaries of activity
2. **Project Resolution**: Fetch project info from Figma API when processing events
3. **More Event Types**: Register for `FILE_COMMENT`, `FILE_VERSION_UPDATE`, etc.
4. **Real-time Notifications**: Option for immediate Slack posts instead of daily digest
5. **Event Deduplication**: Handle duplicate webhook deliveries
6. **Webhook Health Monitoring**: Alert if webhooks stop receiving events

## Troubleshooting

### Webhooks Not Receiving Events

1. **Check webhook registration**:
   - Verify webhooks exist in Figma (no UI for this currently)
   - Check Redis for subscription records

2. **Verify webhook secret**:
   - Ensure `FIGMA_WEBHOOK_SECRET` matches what was used during registration
   - Check logs for signature verification failures

3. **Check Figma webhook status**:
   - Figma may disable webhooks after repeated failures
   - Re-register webhooks if needed

### No Events in Digest

1. **Check webhook storage**:
   - Verify events are being stored in Redis
   - Check TTL hasn't expired (7 days)

2. **Check date range**:
   - Digest looks back to last digest time
   - First run uses 24 hours by default

3. **Check filtering**:
   - Events may be filtered out as not relevant
   - Check logs for filtering details

### Signature Verification Failures

1. **Check secret configuration**:
   - Verify `FIGMA_WEBHOOK_SECRET` is set correctly
   - Ensure no trailing spaces or newlines

2. **Check webhook registration**:
   - Secret must match between registration and verification
   - Re-register webhooks with correct secret

## Migration from Polling

The old polling-based approach has been replaced. Key changes:

### Before (Polling)
- Called `/teams/:team_id/projects` endpoint
- Iterated through all projects and files
- Fetched versions and comments for each file
- Required private OAuth app or PAT

### After (Webhooks)
- Receives events from Figma in real-time
- Stores events in Redis
- Processes accumulated events daily
- Works with public OAuth apps

### Code Changes

1. **Digest endpoint** (`app/api/run-figma-digest/route.ts`):
   - Replaced `fetchAccountActivity` to read from Redis instead of polling API
   - Removed team/project/file iteration logic
   - Added webhook event processing

2. **Storage** (`lib/storage.ts`):
   - Added webhook event storage methods
   - Added webhook subscription tracking

3. **Summary** (`lib/summary.ts`):
   - Updated to use Slack link format: `<url|text>`

4. **Config UI** (`app/config/ConfigInterface.tsx`):
   - Added automatic webhook registration when team IDs are saved

## Security Considerations

1. **Webhook Signature Verification**: All incoming webhooks are verified using HMAC-SHA256
2. **Secret Storage**: Webhook secret stored as environment variable, never in code
3. **Event TTL**: Events automatically expire after 7 days to limit data retention
4. **Authentication**: Webhook registration requires authenticated session
5. **Rate Limiting**: Consider adding rate limiting to webhook endpoint if needed

## Performance

### Storage Usage

- Each event: ~1KB
- 100 events/day: ~100KB/day
- 7-day retention: ~700KB total
- Negligible for Redis

### API Calls

- Webhook reception: No Figma API calls
- Digest processing: 1 API call per event (to fetch file metadata)
- Significant reduction vs. polling (which required calls for teams, projects, files, versions, comments)

### Latency

- Webhook reception: <100ms
- Digest processing: ~1-2 seconds per account
- Slack posting: ~1 second per message (rate limited)

## Future Improvements

1. **Webhook Management UI**: View and manage registered webhooks
2. **Event Replay**: Ability to reprocess events from a specific date
3. **Custom Filters**: User-configurable event filtering rules
4. **Notification Preferences**: Per-user settings for digest frequency
5. **Analytics**: Dashboard showing activity trends over time
6. **Multi-channel Support**: Post to different Slack channels based on team/project
7. **Email Digests**: Alternative to Slack for users without Slack access
8. **Webhook Retry Logic**: Handle failed webhook deliveries
9. **Event Aggregation**: Combine multiple related events into single summary
10. **LLM Integration**: AI-powered summaries and insights

## References

- [Figma Webhooks API](https://www.figma.com/developers/api#webhooks)
- [Figma OAuth Documentation](https://www.figma.com/developers/api#oauth2)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)

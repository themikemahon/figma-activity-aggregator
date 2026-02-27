# Environment Variables Setup Guide

This guide provides detailed instructions for setting up all required and optional environment variables for the Figma-to-Slack Activity Aggregator.

## Quick Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_WEBHOOK_URL` | ✅ Yes | Slack incoming webhook URL |
| `ENCRYPTION_KEY` | ✅ Yes | 32-byte hex string for PAT encryption |
| `KV_REST_API_URL` | ✅ Yes | Upstash Redis REST API URL |
| `KV_REST_API_TOKEN` | ✅ Yes | Upstash Redis REST API token |
| `NEXTAUTH_SECRET` | ✅ Yes | NextAuth.js session encryption key |
| `NEXTAUTH_URL` | ✅ Yes | Application URL |
| `FIGMA_CLIENT_ID` | ✅ Yes | Figma OAuth app client ID |
| `FIGMA_CLIENT_SECRET` | ✅ Yes | Figma OAuth app client secret |
| `FIGMA_WEBHOOK_SECRET` | ✅ Yes | Secret for verifying Figma webhook signatures |
| `KV_REST_API_READ_ONLY_TOKEN` | ❌ No | Upstash read-only token |
| `KV_URL` | ❌ No | Upstash Redis connection URL |
| `ALLOWED_EMAILS` | ❌ No | Email whitelist |
| `DIGEST_LOOKBACK_HOURS` | ❌ No | Activity lookback period |

## Setting Variables in Vercel

### Via Dashboard

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Settings** → **Environment Variables**
4. Click **Add New**
5. Enter variable name and value
6. Select environments (Production, Preview, Development)
7. Click **Save**

### Via CLI

```bash
# Set a single variable
vercel env add VARIABLE_NAME

# Set from file
vercel env pull .env.local
```

### Bulk Import

Create a `.env.production` file locally (DO NOT commit):

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
ENCRYPTION_KEY=abc123...
# ... other variables
```

Then import:
```bash
vercel env add < .env.production
```

## Required Variables

### 1. SLACK_WEBHOOK_URL

**Purpose**: Slack incoming webhook URL for posting activity summaries

**How to Get**:
1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name your app (e.g., "Figma Activity Aggregator")
4. Select your workspace
5. Navigate to "Incoming Webhooks"
6. Toggle "Activate Incoming Webhooks" to ON
7. Click "Add New Webhook to Workspace"
8. Select the channel for posts
9. Copy the webhook URL

**Format**: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX`

**Example**:
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR_WORKSPACE_ID/YOUR_CHANNEL_ID/YOUR_SECRET_TOKEN
```

**Testing**:
```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Test message from Figma aggregator"}' \
  YOUR_WEBHOOK_URL
```

### 2. ENCRYPTION_KEY

**Purpose**: 32-byte hex string for AES-256-GCM encryption of Figma PATs at rest

**How to Generate**:

**Option A - Node.js**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Option B - OpenSSL**:
```bash
openssl rand -hex 32
```

**Option C - Python**:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**Format**: 64-character hexadecimal string

**Example**:
```bash
ENCRYPTION_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
```

**⚠️ Security Notes**:
- Generate a unique key for each environment
- Never commit to version control
- Store securely (password manager, secrets vault)
- If compromised, generate new key and re-encrypt all PATs
- Changing this key will invalidate all stored PATs

### 3. KV_REST_API_URL

**Purpose**: Upstash Redis REST API endpoint

**How to Get**:
1. Go to [Upstash Console](https://console.upstash.com/)
2. Select your Redis database
3. Navigate to "REST API" tab
4. Copy the "UPSTASH_REDIS_REST_URL"

**Format**: `https://your-db-name.upstash.io`

**Example**:
```bash
KV_REST_API_URL=https://figma-activity-storage.upstash.io
```

### 4. KV_REST_API_TOKEN

**Purpose**: Upstash Redis REST API authentication token

**How to Get**:
1. Go to [Upstash Console](https://console.upstash.com/)
2. Select your Redis database
3. Navigate to "REST API" tab
4. Copy the "UPSTASH_REDIS_REST_TOKEN"

**Format**: Long alphanumeric string

**Example**:
```bash
KV_REST_API_TOKEN=AYQgASQgOTk5OTk5OTktOTk5OS05OTk5LTk5OTktOTk5OTk5OTk5OTk5
```

### 5. NEXTAUTH_SECRET

**Purpose**: Secret key for NextAuth.js session encryption and JWT signing

**How to Generate**:

**Option A - OpenSSL**:
```bash
openssl rand -base64 32
```

**Option B - Node.js**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Format**: Base64-encoded string

**Example**:
```bash
NEXTAUTH_SECRET=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ==
```

**⚠️ Security Notes**:
- Generate a unique secret for each environment
- Never commit to version control
- Changing this will invalidate all user sessions

### 6. NEXTAUTH_URL

**Purpose**: Full URL of your deployed application

**Format**: `https://your-domain.com` or `https://your-app.vercel.app`

**Examples**:

**Production**:
```bash
NEXTAUTH_URL=https://figma-aggregator.vercel.app
```

**Preview/Development**:
```bash
NEXTAUTH_URL=https://figma-aggregator-git-main.vercel.app
```

**Local Development**:
```bash
NEXTAUTH_URL=http://localhost:3000
```

**Note**: Vercel automatically sets this for preview deployments, but you should set it explicitly for production.

### 7. FIGMA_CLIENT_ID

**Purpose**: OAuth client ID for your Figma OAuth app

**How to Get**:
1. Go to https://www.figma.com/developers/apps
2. Select your OAuth app (or create one)
3. Copy the "Client ID"

**Format**: Alphanumeric string

**Example**:
```bash
FIGMA_CLIENT_ID=abc123xyz789
```

### 8. FIGMA_CLIENT_SECRET

**Purpose**: OAuth client secret for your Figma OAuth app

**How to Get**:
1. Go to https://www.figma.com/developers/apps
2. Select your OAuth app
3. Copy the "Client Secret"

**Format**: Alphanumeric string

**Example**:
```bash
FIGMA_CLIENT_SECRET=abc123xyz789def456
```

**⚠️ Security Notes**:
- Never commit to version control
- Treat like a password
- Regenerate if compromised

### 9. FIGMA_WEBHOOK_SECRET

**Purpose**: Secret passphrase for verifying Figma webhook signatures

**How to Generate**: Create a random string (can be any value you choose)

**Option A - OpenSSL**:
```bash
openssl rand -base64 32
```

**Option B - Node.js**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Format**: Any string (recommended: 32+ characters)

**Example**:
```bash
FIGMA_WEBHOOK_SECRET=my-super-secret-webhook-passphrase-12345
```

**Note**: This value is used when registering webhooks with Figma and for verifying incoming webhook requests. You choose this value - it's not provided by Figma.

## Optional Variables

### 10. KV_REST_API_READ_ONLY_TOKEN

**Purpose**: Read-only token for Upstash Redis (optional, for read-only operations)

**How to Get**: Same location as `KV_REST_API_TOKEN` in Upstash console

**Example**:
```bash
KV_REST_API_READ_ONLY_TOKEN=AYQgASQgOTk5OTk5OTktOTk5OS05OTk5LTk5OTktOTk5OTk5OTk5OTk5
```

### 11. KV_URL

**Purpose**: Upstash Redis connection URL (optional, for direct Redis protocol)

**How to Get**: Upstash console → Database → "Redis Connect" tab

**Format**: `redis://default:password@host:port`

**Example**:
```bash
KV_URL=redis://default:abc123@figma-activity-storage.upstash.io:6379
```

### 12. ALLOWED_EMAILS

**Purpose**: Comma-separated list of email addresses allowed to access the system

**Format**: `email1@domain.com,email2@domain.com,email3@domain.com`

**Example**:
```bash
ALLOWED_EMAILS=alice@company.com,bob@company.com,charlie@company.com
```

**Behavior**:
- If set: Only listed emails can authenticate
- If empty/unset: All authenticated users can access

**Use Cases**:
- Restrict access to specific team members
- Prevent unauthorized access in shared workspaces
- Compliance requirements

### 13. DIGEST_LOOKBACK_HOURS

**Purpose**: Number of hours to look back for activity when no previous digest timestamp exists

**Format**: Integer (number of hours)

**Default**: `24` (24 hours)

**Examples**:
```bash
DIGEST_LOOKBACK_HOURS=24   # 1 day
DIGEST_LOOKBACK_HOURS=48   # 2 days
DIGEST_LOOKBACK_HOURS=168  # 1 week
```

**Use Cases**:
- First-time setup: Fetch more historical data
- After downtime: Catch up on missed activity
- Testing: Limit data for faster processing

## Environment-Specific Configuration

### Production

Set all required variables with production values:
- Use production Slack webhook
- Use production Upstash database
- Use production email service
- Set `NEXTAUTH_URL` to production domain
- Enable `ALLOWED_EMAILS` for security

### Preview/Staging

Use separate resources to avoid affecting production:
- Separate Slack webhook (test channel)
- Separate Upstash database
- Same email service (or test service)
- Set `NEXTAUTH_URL` to preview domain
- Optional: Disable `ALLOWED_EMAILS` for testing

### Development (Local)

Use local or test resources:
- Test Slack webhook
- Local Redis or test Upstash database
- Test email service or console logging
- Set `NEXTAUTH_URL=http://localhost:3000`
- No `ALLOWED_EMAILS` restriction

## Vercel Environment Scopes

When adding variables in Vercel, select appropriate scopes:

- **Production**: Used for production deployments (`vercel --prod`)
- **Preview**: Used for preview deployments (PR branches)
- **Development**: Used for local development (`vercel dev`)

**Recommendation**: Set all variables for all scopes, using different values where appropriate.

## Security Best Practices

1. **Never Commit Secrets**: Add `.env*` to `.gitignore`
2. **Use Different Keys**: Generate unique keys for each environment
3. **Rotate Regularly**: Change secrets periodically (quarterly recommended)
4. **Limit Access**: Use Vercel team permissions to restrict who can view secrets
5. **Monitor Usage**: Check logs for unauthorized access attempts
6. **Use Read-Only Tokens**: Where possible, use read-only credentials
7. **Encrypt at Rest**: All PATs are encrypted using `ENCRYPTION_KEY`
8. **Audit Logs**: Review Vercel audit logs for secret access

## Troubleshooting

### Variable Not Found

**Symptom**: Application crashes with "Missing environment variable" error

**Solutions**:
1. Verify variable is set in Vercel dashboard
2. Check variable name spelling (case-sensitive)
3. Ensure variable is set for correct environment (Production/Preview/Development)
4. Redeploy after adding variables

### Invalid Variable Value

**Symptom**: Application runs but features don't work

**Solutions**:
1. Verify variable format matches requirements
2. Test external services (Slack webhook, email server)
3. Check for trailing spaces or newlines in values
4. Regenerate secrets if corrupted

### Variables Not Updating

**Symptom**: Changes to variables don't take effect

**Solutions**:
1. Redeploy application after changing variables
2. Clear Vercel cache: `vercel --force`
3. Wait a few minutes for propagation
4. Check correct environment is deployed

## Testing Variables

### Test Slack Webhook
```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Test"}' \
  $SLACK_WEBHOOK_URL
```

### Test Email Server
```bash
# Using swaks (SMTP test tool)
swaks --to test@example.com \
  --from $EMAIL_FROM \
  --server smtp.example.com:587 \
  --auth LOGIN \
  --auth-user username \
  --auth-password password
```

### Test Upstash Redis
```bash
curl -X GET \
  -H "Authorization: Bearer $KV_REST_API_TOKEN" \
  "$KV_REST_API_URL/ping"
```

### Test Encryption Key
```bash
# Should output 64 characters
echo -n $ENCRYPTION_KEY | wc -c
```

## Migration Guide

### Changing Encryption Key

If you need to change `ENCRYPTION_KEY`:

1. **Export existing PATs** (requires old key):
   - Create admin script to decrypt and export all PATs
   - Store securely (encrypted file, password manager)

2. **Generate new key**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Update environment variable** in Vercel

4. **Re-encrypt PATs**:
   - Create migration script to re-encrypt with new key
   - Or have users re-enter PATs via `/config` interface

5. **Verify**: Test authentication and digest functionality

### Moving to Different Redis Instance

1. **Export data** from old instance
2. **Set up new Upstash database**
3. **Update environment variables**:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
4. **Import data** to new instance
5. **Test**: Verify all functionality works
6. **Clean up**: Delete old instance

## Support

For environment variable issues:
1. Check this guide for correct format
2. Verify values in Vercel dashboard
3. Test external services independently
4. Review application logs for specific errors
5. Contact Vercel support for platform issues

## Additional Resources

- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
- [NextAuth.js Configuration](https://next-auth.js.org/configuration/options)
- [Upstash Redis Documentation](https://docs.upstash.com/redis)
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)

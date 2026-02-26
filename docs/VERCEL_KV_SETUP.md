# Vercel KV (Upstash Redis) Setup Guide

This guide walks you through setting up Upstash Redis for use with the Figma-to-Slack Activity Aggregator on Vercel.

## What is Vercel KV?

Vercel KV is a durable Redis database built on Upstash, designed for serverless applications. It provides:
- Low-latency key-value storage
- Automatic scaling
- REST API for serverless compatibility
- Pay-per-request pricing
- Global replication (optional)

## Prerequisites

- Vercel account
- Upstash account (free tier available)

## Setup Options

### Option 1: Create via Vercel Dashboard (Recommended)

1. Go to your Vercel project dashboard
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **KV (Redis)**
5. Choose a name (e.g., "figma-activity-storage")
6. Select a region (choose closest to your deployment)
7. Click **Create**

Vercel will automatically:
- Create the Upstash database
- Set up environment variables
- Link the database to your project

### Option 2: Create via Upstash Console

1. Go to [Upstash Console](https://console.upstash.com/)
2. Sign up or log in
3. Click **Create Database**
4. Configure database:
   - **Name**: figma-activity-storage
   - **Type**: Regional or Global
   - **Region**: Choose closest to your Vercel deployment
   - **TLS**: Enabled (recommended)
5. Click **Create**

## Get Connection Credentials

After creating the database:

1. Go to Upstash console
2. Select your database
3. Navigate to **REST API** tab
4. Copy the following values:
   - `UPSTASH_REDIS_REST_URL` → Use as `KV_REST_API_URL`
   - `UPSTASH_REDIS_REST_TOKEN` → Use as `KV_REST_API_TOKEN`
   - `UPSTASH_REDIS_REST_READ_ONLY_TOKEN` → Use as `KV_REST_API_READ_ONLY_TOKEN` (optional)

5. Navigate to **Redis Connect** tab
6. Copy the connection URL → Use as `KV_URL` (optional)

## Add Environment Variables to Vercel

### Via Vercel Dashboard

1. Go to your Vercel project
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
KV_REST_API_URL=https://your-db.upstash.io
KV_REST_API_TOKEN=your-token-here
```

4. Select environments: Production, Preview, Development
5. Click **Save**

### Via Vercel CLI

```bash
vercel env add KV_REST_API_URL
# Paste your URL when prompted

vercel env add KV_REST_API_TOKEN
# Paste your token when prompted
```

## Verify Connection

### Test via Upstash Console

1. Go to Upstash console
2. Select your database
3. Navigate to **CLI** tab
4. Run test commands:

```redis
PING
# Should return: PONG

SET test "Hello World"
# Should return: OK

GET test
# Should return: "Hello World"

DEL test
# Should return: 1
```

### Test via REST API

```bash
# Test ping
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "YOUR_URL/ping"

# Should return: {"result":"PONG"}
```

### Test in Application

Deploy your application and check logs:

```bash
vercel logs --follow
```

Look for successful storage operations in the logs.

## Database Schema

The application uses the following key patterns:

### User Management
- `users` → Set of all user IDs
- `user:{userId}:accounts` → Set of account names for a user

### Account Storage
- `user:{userId}:account:{accountName}:pat` → Encrypted PAT
- `user:{userId}:account:{accountName}:expires` → PAT expiration timestamp
- `user:{userId}:account:{accountName}:lastDigest` → Last digest timestamp

### Example Keys
```
users → {"user1", "user2", "user3"}
user:user1:accounts → {"personal", "client-a"}
user:user1:account:personal:pat → "encrypted_pat_value"
user:user1:account:personal:expires → "2026-12-31T23:59:59Z"
user:user1:account:personal:lastDigest → "2026-02-26T09:00:00Z"
```

## Pricing

### Upstash Free Tier
- 10,000 commands per day
- 256 MB storage
- TLS support
- REST API access

### Pay-as-you-go
- $0.2 per 100K commands
- $0.25 per GB storage
- No minimum commitment

### Pro Plans
- Fixed monthly pricing
- Higher limits
- Priority support

See [Upstash Pricing](https://upstash.com/pricing) for current rates.

## Monitoring Usage

### Via Upstash Console

1. Go to Upstash console
2. Select your database
3. View **Metrics** tab:
   - Command count
   - Storage usage
   - Request latency
   - Error rate

### Via Vercel Dashboard

1. Go to Vercel project
2. Navigate to **Storage** tab
3. Select your KV database
4. View usage metrics

## Best Practices

### Security
1. **Use TLS**: Always enable TLS for production
2. **Rotate Tokens**: Periodically regenerate access tokens
3. **Read-Only Tokens**: Use read-only tokens where possible
4. **Environment Variables**: Never commit tokens to version control

### Performance
1. **Choose Nearby Region**: Select region closest to Vercel deployment
2. **Connection Pooling**: Reuse connections in serverless functions
3. **Batch Operations**: Use pipelines for multiple commands
4. **Monitor Latency**: Check metrics regularly

### Cost Optimization
1. **Set Expiration**: Use TTL for temporary data
2. **Compress Data**: Compress large values before storing
3. **Monitor Usage**: Set up alerts for high usage
4. **Clean Up**: Delete unused keys regularly

## Troubleshooting

### Connection Errors

**Symptom**: "Failed to connect to Redis"

**Solutions**:
1. Verify environment variables are set correctly
2. Check token hasn't expired
3. Verify database is active in Upstash console
4. Test connection using curl command above

### Authentication Errors

**Symptom**: "Unauthorized" or "Invalid token"

**Solutions**:
1. Regenerate token in Upstash console
2. Update environment variable in Vercel
3. Redeploy application
4. Verify token is copied completely (no spaces)

### Timeout Errors

**Symptom**: "Request timeout"

**Solutions**:
1. Check database region matches deployment region
2. Verify network connectivity
3. Check Upstash status page
4. Increase function timeout in vercel.json

### Storage Limit Errors

**Symptom**: "Out of memory" or "Storage limit exceeded"

**Solutions**:
1. Check current usage in Upstash console
2. Upgrade to higher tier if needed
3. Clean up old data
4. Implement data retention policy

## Data Management

### Backup Data

```bash
# Export all keys
redis-cli --scan --pattern '*' > keys.txt

# Export key-value pairs
redis-cli --scan --pattern '*' | while read key; do
  echo "$key: $(redis-cli GET $key)"
done > backup.txt
```

### Restore Data

```bash
# Import from backup
while IFS=: read -r key value; do
  redis-cli SET "$key" "$value"
done < backup.txt
```

### Clear All Data

⚠️ **Warning**: This will delete all data!

```bash
# Via Upstash console CLI
FLUSHDB

# Or via REST API
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "YOUR_URL/flushdb"
```

## Migration

### Moving to Different Database

1. **Export data** from old database
2. **Create new database** in Upstash
3. **Update environment variables** in Vercel
4. **Import data** to new database
5. **Test application** thoroughly
6. **Delete old database** after verification

### Upgrading Plan

1. Go to Upstash console
2. Select your database
3. Click **Upgrade**
4. Choose new plan
5. Confirm upgrade
6. No code changes needed

## Support

### Upstash Support
- Documentation: https://docs.upstash.com/redis
- Discord: https://upstash.com/discord
- Email: support@upstash.com

### Vercel Support
- Documentation: https://vercel.com/docs/storage/vercel-kv
- Support: https://vercel.com/support

## Additional Resources

- [Upstash Redis Documentation](https://docs.upstash.com/redis)
- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [Redis Commands Reference](https://redis.io/commands)
- [Upstash REST API](https://docs.upstash.com/redis/features/restapi)

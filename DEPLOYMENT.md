# Vercel Deployment Guide

This guide covers deploying the Figma-to-Slack Activity Aggregator to Vercel.

## Prerequisites

- Vercel account
- GitHub repository connected to Vercel
- Slack workspace with webhook access
- Figma account(s) with Personal Access Tokens

## Step 1: Set Up Upstash Redis Database

1. Go to [Upstash Console](https://console.upstash.com/)
2. Create a new Redis database or use existing one
3. Select a region close to your Vercel deployment
4. Copy the connection credentials

The following environment variables are needed from Upstash:
- `KV_REST_API_URL` - REST API endpoint
- `KV_REST_API_TOKEN` - REST API token
- `KV_REST_API_READ_ONLY_TOKEN` - Read-only token (optional)
- `KV_URL` - Redis connection URL

You can find these in the Upstash console under your database's "REST API" section.

## Step 2: Configure Environment Variables

Add the following environment variables in your Vercel project settings (Settings → Environment Variables).

For detailed setup instructions, see [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md).

### Quick Setup Checklist

#### Required Variables

- [ ] `SLACK_WEBHOOK_URL` - Get from https://api.slack.com/apps
- [ ] `ENCRYPTION_KEY` - Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] `KV_REST_API_URL` - From Upstash console
- [ ] `KV_REST_API_TOKEN` - From Upstash console
- [ ] `NEXTAUTH_SECRET` - Generate: `openssl rand -base64 32`
- [ ] `NEXTAUTH_URL` - Your app URL (e.g., `https://your-app.vercel.app`)
- [ ] `EMAIL_SERVER` - SMTP server URL (e.g., `smtp://apikey:SG.xxxxx@smtp.sendgrid.net:587`)
- [ ] `EMAIL_FROM` - Sender email (e.g., `noreply@your-domain.com`)

#### Optional Variables

- [ ] `ALLOWED_EMAILS` - Comma-separated email whitelist (leave empty to allow all)
- [ ] `DIGEST_LOOKBACK_HOURS` - Default: 24 hours

See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for:
- Detailed setup instructions for each variable
- How to obtain API keys and credentials
- Testing commands
- Security best practices
- Troubleshooting tips

## Step 3: Deploy to Vercel

### Option A: Deploy via GitHub Integration

1. Push your code to GitHub
2. Go to Vercel dashboard
3. Click "New Project"
4. Import your GitHub repository
5. Vercel will auto-detect Next.js configuration
6. Add environment variables (see Step 2)
7. Click "Deploy"

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

## Step 4: Configure Cron Job

The cron job is already configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/run-figma-digest",
      "schedule": "0 9 * * *"
    }
  ]
}
```

**Current schedule**: Daily at 9:00 AM UTC

**Important**: Cron jobs require a Vercel Pro plan or higher. If you're on the Hobby (free) plan, see [CRON_CONFIGURATION.md](./CRON_CONFIGURATION.md) for alternative solutions using external cron services.

### Modify Schedule

See [CRON_CONFIGURATION.md](./CRON_CONFIGURATION.md) for:
- Common schedule examples
- Timezone conversion guide
- Recommended schedules by team size
- Testing and troubleshooting tips
- Alternative cron services for Hobby plan

Quick examples:
- `0 * * * *` - Every hour at minute 0
- `0 */6 * * *` - Every 6 hours
- `0 9,17 * * *` - Daily at 9 AM and 5 PM
- `0 9 * * 1-5` - Weekdays at 9 AM

After modifying, redeploy:
```bash
vercel --prod
```

## Step 5: Verify Deployment

### Test Authentication
1. Visit `https://your-app.vercel.app/config`
2. Sign in with magic link
3. Verify you can access the configuration interface

### Test Digest Endpoint
```bash
curl -X GET https://your-app.vercel.app/api/run-figma-digest
```

Expected response:
```json
{
  "success": true,
  "eventsProcessed": 0,
  "accountsProcessed": 0,
  "errors": [],
  "duration": 1234
}
```

### Check Logs
1. Go to Vercel dashboard
2. Select your project
3. Click "Deployments"
4. Click on latest deployment
5. View "Functions" tab for logs

## Step 6: Add Figma Accounts

1. Visit `https://your-app.vercel.app/config`
2. Sign in
3. Click "Add Account"
4. Enter account name (e.g., "personal", "client-a")
5. Enter Figma Personal Access Token
6. Click "Save"

### Creating Figma PATs

1. Go to https://www.figma.com/settings
2. Scroll to "Personal access tokens"
3. Click "Create new token"
4. Name it (e.g., "Slack Aggregator")
5. Set expiration (optional but recommended)
6. Copy the token immediately (it won't be shown again)

## Troubleshooting

### Cron Job Not Running

- Verify cron configuration in `vercel.json`
- Check Vercel dashboard → Project → Settings → Cron Jobs
- Cron jobs require a Pro plan or higher
- Check function logs for errors

### Authentication Issues

- Verify `NEXTAUTH_SECRET` is set
- Verify `NEXTAUTH_URL` matches your deployment URL
- Check email server configuration
- Verify `EMAIL_FROM` is a valid sender address

### Redis/Upstash Storage Errors

- Verify Upstash Redis database is created and accessible
- Check environment variables are set correctly (KV_REST_API_URL, KV_REST_API_TOKEN)
- Verify Redis database is in a region close to your Vercel deployment
- Test connection using Upstash console or Redis CLI

### Figma API Errors

- Verify PAT is valid and not expired
- Check PAT has correct permissions (read-only access to files)
- Verify account name is unique per user

### Slack Webhook Errors

- Verify webhook URL is correct
- Test webhook manually: `curl -X POST -H 'Content-Type: application/json' -d '{"text":"Test"}' YOUR_WEBHOOK_URL`
- Check Slack app configuration

## Function Timeout Configuration

The digest endpoint has a 60-second timeout (Vercel Pro plan):

```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

**Hobby plan**: 10 seconds max
**Pro plan**: 60 seconds max
**Enterprise**: Custom limits

If processing takes longer:
- Reduce number of accounts
- Increase digest frequency (process less data per run)
- Optimize API calls (parallel processing)

## Security Best Practices

1. **Never commit secrets**: Use environment variables only
2. **Rotate encryption key**: If compromised, generate new key and re-encrypt all PATs
3. **Use email whitelist**: Set `ALLOWED_EMAILS` in production
4. **Monitor PAT expiration**: System will alert in Slack 3 days before expiry
5. **Review logs regularly**: Check for unauthorized access attempts
6. **Use HTTPS only**: Vercel provides this by default

## Monitoring

### View Function Logs
```bash
vercel logs YOUR_DEPLOYMENT_URL
```

### Monitor Cron Executions
- Vercel dashboard → Project → Cron Jobs
- View execution history and success/failure rates

### Slack Notifications
- Digest summaries posted to configured channel
- PAT expiration warnings
- Error notifications for failed accounts

## Scaling Considerations

- **Multiple users**: System supports unlimited users with separate PAT storage
- **Multiple accounts per user**: Each user can configure multiple Figma accounts
- **Rate limits**: Figma API has rate limits; system implements exponential backoff
- **Function timeout**: Consider splitting large digests into multiple runs
- **KV storage**: Vercel KV has generous limits; monitor usage in dashboard

## Cost Estimates

### Vercel Pricing
- **Hobby**: Free (10s function timeout, limited cron)
- **Pro**: $20/month (60s timeout, unlimited cron)
- **Enterprise**: Custom pricing

### Upstash Redis Pricing
- **Free Tier**: 10,000 commands/day, 256 MB storage
- **Pay-as-you-go**: $0.2 per 100K commands
- **Pro**: Fixed monthly pricing with higher limits
- See [Upstash Pricing](https://upstash.com/pricing) for details

### Recommended Plan
- **Small team (1-5 users)**: Hobby plan may suffice
- **Medium team (5-20 users)**: Pro plan recommended
- **Large team (20+ users)**: Pro or Enterprise

## Support

For issues or questions:
1. Check function logs in Vercel dashboard
2. Review error messages in Slack
3. Consult this deployment guide
4. Check Next.js and Vercel documentation

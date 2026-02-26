# Cron Job Configuration Guide

This guide explains how to configure the automated digest cron job for the Figma-to-Slack Activity Aggregator.

## Current Configuration

The cron job is configured in `vercel.json`:

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

**Current Schedule**: Daily at 9:00 AM UTC

## Cron Syntax

Vercel uses standard cron syntax with 5 fields:

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 are Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

## Common Schedule Examples

### Hourly
```json
"schedule": "0 * * * *"
```
Runs at the start of every hour (e.g., 1:00, 2:00, 3:00)

### Every 6 Hours
```json
"schedule": "0 */6 * * *"
```
Runs at 00:00, 06:00, 12:00, 18:00 UTC

### Every 4 Hours
```json
"schedule": "0 */4 * * *"
```
Runs at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC

### Twice Daily
```json
"schedule": "0 9,17 * * *"
```
Runs at 9:00 AM and 5:00 PM UTC

### Business Hours Only
```json
"schedule": "0 9-17 * * 1-5"
```
Runs every hour from 9 AM to 5 PM, Monday through Friday UTC

### Daily at Specific Time
```json
"schedule": "30 14 * * *"
```
Runs daily at 2:30 PM UTC

### Weekly
```json
"schedule": "0 9 * * 1"
```
Runs every Monday at 9:00 AM UTC

### Multiple Times Per Day
```json
"schedule": "0 6,12,18 * * *"
```
Runs at 6:00 AM, 12:00 PM, and 6:00 PM UTC

## Recommended Schedules by Team Size

### Small Team (1-5 users)
- **Daily**: `0 9 * * *` - Once per day at 9 AM
- **Twice Daily**: `0 9,17 * * *` - Morning and evening

### Medium Team (5-20 users)
- **Every 6 hours**: `0 */6 * * *` - 4 times per day
- **Business hours**: `0 9-17/2 * * 1-5` - Every 2 hours during work days

### Large Team (20+ users)
- **Every 4 hours**: `0 */4 * * *` - 6 times per day
- **Hourly during business**: `0 9-17 * * 1-5` - Every hour, weekdays only

## Timezone Considerations

Vercel cron jobs run in **UTC timezone**. Convert your local time to UTC:

- **PST/PDT** (US Pacific): UTC - 8 hours (PST) or UTC - 7 hours (PDT)
- **EST/EDT** (US Eastern): UTC - 5 hours (EST) or UTC - 4 hours (EDT)
- **GMT/BST** (UK): UTC + 0 hours (GMT) or UTC + 1 hour (BST)
- **CET/CEST** (Central Europe): UTC + 1 hour (CET) or UTC + 2 hours (CEST)

### Example: 9 AM Local Time

| Local Timezone | UTC Time | Cron Schedule |
|---------------|----------|---------------|
| 9 AM PST | 5 PM UTC | `0 17 * * *` |
| 9 AM EST | 2 PM UTC | `0 14 * * *` |
| 9 AM GMT | 9 AM UTC | `0 9 * * *` |
| 9 AM CET | 8 AM UTC | `0 8 * * *` |

## How to Change the Schedule

1. Edit `vercel.json` and update the `schedule` field
2. Commit and push changes to your repository
3. Redeploy to Vercel:
   ```bash
   vercel --prod
   ```
4. Verify in Vercel dashboard: Project → Settings → Cron Jobs

## Multiple Cron Jobs

You can configure multiple cron jobs with different schedules:

```json
{
  "crons": [
    {
      "path": "/api/run-figma-digest",
      "schedule": "0 */6 * * *",
      "description": "Run digest every 6 hours"
    },
    {
      "path": "/api/run-figma-digest",
      "schedule": "0 0 * * 0",
      "description": "Weekly full digest on Sunday"
    }
  ]
}
```

**Note**: The same endpoint can be triggered multiple times with different schedules.

## Vercel Plan Requirements

### Hobby Plan (Free)
- ❌ Cron jobs are **NOT available**
- Must trigger digest manually or use external cron service

### Pro Plan ($20/month)
- ✅ Unlimited cron jobs
- ✅ 60-second function timeout
- ✅ Recommended for production use

### Enterprise Plan
- ✅ Unlimited cron jobs
- ✅ Custom function timeouts
- ✅ Priority support

## Alternative: External Cron Services

If you're on the Hobby plan, use external services to trigger the digest:

### 1. GitHub Actions

Create `.github/workflows/digest.yml`:

```yaml
name: Trigger Figma Digest
on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger digest endpoint
        run: |
          curl -X GET https://your-app.vercel.app/api/run-figma-digest
```

### 2. Cron-job.org

1. Go to [cron-job.org](https://cron-job.org/)
2. Create free account
3. Add new cron job:
   - URL: `https://your-app.vercel.app/api/run-figma-digest`
   - Schedule: Configure as needed
   - Method: GET

### 3. EasyCron

1. Go to [easycron.com](https://www.easycron.com/)
2. Create free account (limited jobs)
3. Add cron job with your digest URL

### 4. UptimeRobot

1. Go to [uptimerobot.com](https://uptimerobot.com/)
2. Create monitor for your digest endpoint
3. Set check interval (minimum 5 minutes on free plan)

## Testing the Cron Job

### Manual Trigger

Test the digest endpoint manually:

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

### View Cron Execution History

1. Go to Vercel dashboard
2. Select your project
3. Navigate to Settings → Cron Jobs
4. View execution history with timestamps and status

### Check Logs

View function logs for cron executions:

```bash
vercel logs --follow
```

Or in Vercel dashboard:
1. Go to Deployments
2. Click on latest deployment
3. View Functions tab
4. Filter by `/api/run-figma-digest`

## Troubleshooting

### Cron Job Not Running

**Check Plan**: Verify you're on Pro or Enterprise plan
```bash
vercel whoami
```

**Verify Configuration**: Check `vercel.json` syntax
```bash
cat vercel.json | jq .crons
```

**Check Deployment**: Ensure latest code is deployed
```bash
vercel ls
```

**View Logs**: Check for errors in function logs
```bash
vercel logs --follow
```

### Cron Job Timing Out

**Increase Timeout**: Update `vercel.json` (Pro plan: max 60s, Enterprise: custom)
```json
{
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

**Optimize Processing**:
- Reduce number of accounts processed per run
- Increase cron frequency (process less data per run)
- Implement parallel processing with concurrency limits

### Cron Job Failing

**Check Environment Variables**: Verify all required vars are set
- SLACK_WEBHOOK_URL
- ENCRYPTION_KEY
- KV_REST_API_URL
- KV_REST_API_TOKEN

**Test Manually**: Run digest endpoint manually to see detailed errors
```bash
curl -v https://your-app.vercel.app/api/run-figma-digest
```

**Check Slack Webhook**: Verify webhook is valid
```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Test"}' \
  YOUR_SLACK_WEBHOOK_URL
```

## Best Practices

1. **Start Conservative**: Begin with less frequent runs (daily) and increase as needed
2. **Monitor Performance**: Watch function duration and adjust timeout if needed
3. **Check Slack**: Verify messages are posting correctly
4. **Review Logs**: Regularly check for errors or warnings
5. **Test Changes**: Always test manually before relying on cron
6. **Document Schedule**: Add comments in `vercel.json` explaining schedule choice
7. **Consider Timezones**: Schedule during off-peak hours for your team
8. **Plan for Growth**: As team grows, may need more frequent digests

## Performance Optimization

### Reduce Processing Time

1. **Parallel Processing**: Process accounts concurrently
2. **Pagination**: Limit API calls per run
3. **Caching**: Cache team/project lists
4. **Incremental**: Only fetch new activity since last digest

### Monitor Resource Usage

- Function execution time
- API call count (Figma rate limits)
- Redis command count (Upstash limits)
- Slack message count (rate limits)

## Support

For cron-related issues:
1. Check Vercel dashboard for execution history
2. Review function logs for errors
3. Test endpoint manually
4. Verify plan supports cron jobs
5. Contact Vercel support if needed

## Additional Resources

- [Vercel Cron Jobs Documentation](https://vercel.com/docs/cron-jobs)
- [Cron Expression Generator](https://crontab.guru/)
- [Vercel Function Logs](https://vercel.com/docs/observability/runtime-logs)

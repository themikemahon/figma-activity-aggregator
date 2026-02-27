# Webhook Implementation Deployment Checklist

## Pre-Deployment

- [ ] Review all code changes
- [ ] Verify no TypeScript errors: `npm run build`
- [ ] Run tests if available: `npm test`

## Environment Variables

Add to Vercel (Production, Preview, Development):

- [ ] `FIGMA_WEBHOOK_SECRET` - Generate with: `openssl rand -base64 32`

Existing variables (verify they're still set):
- [ ] `FIGMA_CLIENT_ID`
- [ ] `FIGMA_CLIENT_SECRET`
- [ ] `SLACK_WEBHOOK_URL`
- [ ] `ENCRYPTION_KEY`
- [ ] `KV_REST_API_URL`
- [ ] `KV_REST_API_TOKEN`
- [ ] `NEXTAUTH_SECRET`
- [ ] `NEXTAUTH_URL`

## Deployment Steps

1. [ ] Commit all changes to git
2. [ ] Push to GitHub (triggers Vercel deployment)
3. [ ] Wait for Vercel deployment to complete
4. [ ] Verify deployment succeeded in Vercel dashboard

## Post-Deployment Testing

### 1. Test Authentication
- [ ] Visit https://your-app.vercel.app
- [ ] Sign in with Figma OAuth
- [ ] Verify redirect to config page

### 2. Test Account Configuration
- [ ] Add team IDs for both accounts:
  - GenStudio: `1486397302629318522`
  - Malka: `816349427808060021`
- [ ] Verify webhooks are registered (check logs)
- [ ] Verify no errors in browser console

### 3. Test Webhook Reception
- [ ] Make a change to a Figma file in one of the teams
- [ ] Check Vercel logs: `vercel logs --follow`
- [ ] Look for: `[FigmaWebhook] Webhook event received`
- [ ] Verify event stored in Redis (via Upstash console)

### 4. Test Digest Processing
- [ ] Wait for daily cron (or trigger manually)
- [ ] Trigger manually: `curl https://your-app.vercel.app/api/run-figma-digest`
- [ ] Check Vercel logs for processing details
- [ ] Verify message posted to Slack #figma-feed channel
- [ ] Verify file links are clickable

### 5. Test Event Filtering
- [ ] Make changes to files as your user
- [ ] Have another user comment on your files
- [ ] Run digest
- [ ] Verify both types of events appear in Slack
- [ ] Verify events from other users (not related to you) are filtered out

## Troubleshooting

### Webhooks Not Registering
- Check `FIGMA_WEBHOOK_SECRET` is set
- Check OAuth token has correct scopes
- Check Vercel logs for registration errors
- Verify team IDs are correct (19-digit numbers)

### Webhooks Not Receiving Events
- Verify webhook registration succeeded
- Check Figma file is in the correct team
- Check webhook signature verification (logs)
- Verify `FIGMA_WEBHOOK_SECRET` matches registration

### No Events in Digest
- Check Redis for stored events (Upstash console)
- Verify events are within 7-day TTL
- Check digest lookback time (default 24 hours)
- Check event filtering logic (logs)

### Slack Messages Not Posting
- Verify `SLACK_WEBHOOK_URL` is correct
- Test webhook manually: `curl -X POST -H 'Content-Type: application/json' -d '{"text":"Test"}' $SLACK_WEBHOOK_URL`
- Check Vercel logs for Slack API errors
- Verify rate limiting isn't blocking messages

## Rollback Plan

If issues occur:

1. [ ] Revert to previous deployment in Vercel dashboard
2. [ ] Or: Revert git commit and push
3. [ ] Verify old version is working
4. [ ] Investigate issues in logs
5. [ ] Fix and redeploy

## Monitoring

After deployment, monitor:

- [ ] Vercel logs for errors
- [ ] Slack channel for digest messages
- [ ] Redis storage usage (Upstash console)
- [ ] Webhook event volume

## Success Criteria

Deployment is successful when:

- ✅ Users can sign in with Figma OAuth
- ✅ Users can add team IDs and webhooks register automatically
- ✅ Figma file changes trigger webhook events
- ✅ Events are stored in Redis
- ✅ Daily digest processes events and posts to Slack
- ✅ Slack messages include clickable file links
- ✅ Only relevant events are included in digest

## Next Steps

After successful deployment:

1. [ ] Monitor for 24-48 hours
2. [ ] Gather user feedback
3. [ ] Consider enhancements:
   - LLM summarization
   - Project name resolution
   - Additional event types
   - Real-time notifications option
4. [ ] Update documentation based on learnings
5. [ ] Plan next iteration

## Notes

- First digest run will only include events after webhook registration
- Historical events before webhook setup are not captured
- Webhook events have 7-day TTL in Redis
- Digest runs daily via Vercel cron (requires Pro plan)

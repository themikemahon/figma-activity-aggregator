# OAuth Migration Complete

## What Changed

### Authentication
- **Removed**: Email-based magic link authentication
- **Added**: Figma OAuth authentication ("Sign in with Figma")
- Users now authenticate directly with Figma, which provides OAuth tokens with full team access

### Account Management
- **Removed**: Manual PAT entry and team ID configuration
- **Added**: Automatic OAuth token storage
- OAuth tokens are stored encrypted in Redis and automatically refreshed

### Benefits
- ✅ No more 403 errors - OAuth tokens have same permissions as the user
- ✅ No manual team ID configuration - access all teams automatically
- ✅ Automatic token refresh - tokens stay valid
- ✅ Simpler UX - just "Sign in with Figma"

## What You Need To Do

### Step 1: Add Environment Variables to Vercel

Go to your Vercel project settings and add:

```
FIGMA_CLIENT_ID=your_client_id_from_figma
FIGMA_CLIENT_SECRET=your_client_secret_from_figma
```

Keep your existing variables:
- `ENCRYPTION_KEY`
- `NEXTAUTH_SECRET`
- `SLACK_WEBHOOK_URL`

You can remove (no longer needed):
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_FROM`
- `ALLOWED_EMAILS`

### Step 2: Deploy

```bash
git add -A
git commit -m "Migrate to Figma OAuth authentication"
git push
```

### Step 3: Test

1. Go to https://figma-activity-aggregator.vercel.app
2. Click "Sign in with Figma"
3. Authorize the app
4. You'll be redirected to `/config`
5. Manually trigger a digest: https://figma-activity-aggregator.vercel.app/api/run-figma-digest

### Step 4: Clean Up Old Data (Optional)

The old PAT-based accounts are still in Redis but won't be used. You can leave them or manually clear them from Upstash console.

## How It Works Now

1. **User signs in** → Figma OAuth flow → OAuth tokens stored encrypted in Redis
2. **Digest runs** → Retrieves OAuth token → Calls Figma API with user's full permissions
3. **Token expires** → Automatically refreshed using refresh token
4. **Activity tracked** → Across ALL teams the user has access to (no manual configuration!)

## Troubleshooting

### "Sign in with Figma" button doesn't work
- Check that `FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET` are set in Vercel
- Check that redirect URL in Figma app matches: `https://figma-activity-aggregator.vercel.app/api/auth/callback/figma`

### Still getting 403 errors
- Sign out and sign in again to get fresh OAuth tokens
- Check that your Figma OAuth app has the correct scopes selected

### No activity in Slack
- Manually trigger digest to test: `/api/run-figma-digest`
- Check Vercel logs for errors
- Verify `SLACK_WEBHOOK_URL` is correct

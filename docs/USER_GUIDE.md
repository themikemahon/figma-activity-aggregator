# User Guide: Figma-to-Slack Activity Aggregator

This guide explains how to use the Figma-to-Slack Activity Aggregator to track activity across your Figma accounts.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Adding Figma Accounts](#adding-figma-accounts)
3. [Managing PATs](#managing-pats)
4. [Understanding Slack Messages](#understanding-slack-messages)
5. [Troubleshooting](#troubleshooting)
6. [Best Practices](#best-practices)

## Getting Started

### Accessing the Configuration Interface

1. Navigate to your deployed application URL (e.g., `https://your-app.vercel.app/config`)
2. Click "Sign in" to authenticate
3. Check your email for a magic link
4. Click the link to complete authentication
5. You'll be redirected to the configuration interface

### First-Time Setup

After signing in for the first time:

1. You'll see an empty account list
2. Click "Add Account" to configure your first Figma account
3. Follow the steps in [Adding Figma Accounts](#adding-figma-accounts)

## Adding Figma Accounts

### Step 1: Create a Figma Personal Access Token (PAT)

1. Go to [Figma Settings](https://www.figma.com/settings)
2. Scroll down to "Personal access tokens"
3. Click "Create new token"
4. Give it a descriptive name (e.g., "Slack Aggregator - Personal")
5. **Optional but recommended**: Set an expiration date
6. Click "Create token"
7. **Important**: Copy the token immediately - you won't be able to see it again!

**Token Permissions**:
- The system only needs read-only access
- The token will see activity from all files you have access to
- Activity includes versions and comments from all users in those files

### Step 2: Add Account in Configuration Interface

1. In the configuration interface, click "Add Account"
2. Enter an **Account Name**:
   - Use a descriptive name (e.g., "personal", "client-acme", "work")
   - Must be unique across your accounts
   - Use lowercase and hyphens (e.g., "client-a" not "Client A")
3. Paste your **Figma PAT** in the token field
4. Click "Save"

### Step 3: Validation

The system will:
- Test the PAT by making a Figma API call
- Verify the token is valid and has correct permissions
- Show a success message if validation passes
- Display an error if the token is invalid

**Common validation errors**:
- "Invalid token": Token is incorrect or expired
- "Insufficient permissions": Token doesn't have required access
- "Network error": Temporary connection issue - try again

### Step 4: Confirmation

Once added successfully:
- Your account appears in the account list
- The PAT is encrypted and stored securely
- The system will start collecting activity on the next digest run
- You'll see the masked PAT (last 4 characters only)

## Managing PATs

### Viewing Your Accounts

The configuration interface shows:
- **Account Name**: Your chosen identifier
- **PAT**: Masked value showing only last 4 characters (e.g., `****...abc123`)
- **Expiration**: When the PAT expires (if set)
- **Status**: Active, expiring soon, or expired
- **Created**: When you added the account
- **Updated**: Last time you modified the account

### Updating a PAT

To update an existing PAT (e.g., after rotation):

1. Click "Edit" next to the account
2. Enter the new PAT
3. Click "Save"
4. The system validates the new token
5. Old PAT is securely deleted and replaced

**When to update**:
- PAT is expiring soon (you'll get Slack notifications)
- PAT has been compromised
- You want to change permissions
- Regular security rotation (recommended quarterly)

### Deleting an Account

To remove a Figma account:

1. Click "Delete" next to the account
2. Confirm the deletion
3. The PAT is permanently deleted from storage
4. Activity collection stops for that account

**Note**: Deleting an account does not delete historical Slack messages.

### Adding Multiple Accounts

You can add multiple Figma accounts to track activity across:
- Personal workspace
- Client workspaces
- Different team workspaces
- Separate organizations

**Example setup**:
- Account: "personal" - Your personal Figma workspace
- Account: "client-acme" - ACME Corp client work
- Account: "client-globex" - Globex Inc client work

Each account requires its own PAT from the respective Figma workspace.

## Understanding Slack Messages

### Message Format

The system posts two types of messages to Slack:

#### 1. Per-Event Messages

Individual activity events are posted in this format:

```
[FIGMA][account-name] 2026-02-26 09:03 – Project Name • User Name – action "File Name" https://figma.com/file/...
```

**Components**:
- `[FIGMA]`: Message prefix for filtering
- `[account-name]`: Which Figma account (e.g., "personal", "client-a")
- `2026-02-26 09:03`: Timestamp of the activity
- `Project Name`: Figma project containing the file
- `User Name`: Person who performed the action
- `action`: Type of activity (see below)
- `"File Name"`: Name of the Figma file
- `URL`: Deep link to the specific version or comment

**Example**:
```
[FIGMA][personal] 2026-02-26 14:32 – Brand System • Sarah Chen – Published new version of "Homepage Concepts" https://www.figma.com/file/abc123?version-id=456789
```

#### 2. Daily Recap Messages

Summary of all activity for the day:

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
• personal: 28 events
• client-acme: 15 events
• client-globex: 4 events
```

### Action Types

Common action types you'll see:

- **Published new version**: Someone saved a new version of a file
- **Added comment**: Someone commented on a file
- **Published library**: Someone published a library update
- **Created file**: New file was created
- **Updated file**: File was modified

### Deep Links

Clicking the URL in a message takes you directly to:
- **Version links**: Specific file version with `?version-id=` parameter
- **Comment links**: Specific comment with `?comment-id=` parameter
- **File links**: Base file without specific version

### Searching in Slack

Use Slack search to find specific activity:

**Search by account**:
```
[FIGMA][personal]
```

**Search by user**:
```
[FIGMA] Sarah Chen
```

**Search by project**:
```
[FIGMA] Brand System
```

**Search by file**:
```
[FIGMA] "Homepage Concepts"
```

**Search by date**:
```
[FIGMA] 2026-02-26
```

**Combine filters**:
```
[FIGMA][client-acme] Sarah Chen
```

### Glean Integration

If your organization uses Glean:
- All Slack messages are automatically indexed
- Search across all Figma activity from Glean
- Use natural language queries
- Filter by date, person, project, or account

## Troubleshooting

### Not Receiving Slack Messages

**Check 1: Verify accounts are configured**
- Go to `/config` interface
- Ensure at least one account is added
- Verify PAT status is "Active"

**Check 2: Wait for next digest**
- Digests run on a schedule (check with your admin)
- Manual trigger: Ask admin to run `/api/run-figma-digest`

**Check 3: Verify there's activity**
- Ensure there's been activity in your Figma files
- Check the time range (default: last 24 hours)

**Check 4: Check Slack webhook**
- Ask admin to verify webhook is configured correctly
- Test webhook manually (admin task)

### PAT Expiration Warnings

You'll receive Slack notifications when:
- PAT expires in 3 days: Warning message
- PAT has expired: Urgent notification

**What to do**:
1. Create a new PAT in Figma (see [Step 1](#step-1-create-a-figma-personal-access-token-pat))
2. Update the account in `/config` interface
3. Verify the update was successful

**Notification format**:
```
⚠️ Figma PAT Expiration Warning

User: your-email@company.com
Account: personal
Expires: 2026-03-01 (in 2 days)

Please update your PAT at https://your-app.vercel.app/config
```

### Authentication Issues

**Can't sign in**:
- Check your email for the magic link
- Link expires after 24 hours - request a new one
- Check spam folder
- Verify your email is allowed (if whitelist is enabled)

**Session expired**:
- Click "Sign in" again
- Check your email for new magic link
- Sessions expire after 30 days of inactivity

**Email not whitelisted**:
- Contact your admin to add your email to `ALLOWED_EMAILS`
- Or ask admin to remove whitelist restriction

### Missing Activity

**Activity not showing up**:
- Verify you have access to the files in Figma
- Check if activity is within the time range
- Ensure PAT has correct permissions
- Wait for next digest run

**Partial activity**:
- Some files may be private or restricted
- PAT only sees files the token owner can access
- Check Figma permissions for the PAT owner

### Validation Errors

**"Invalid token"**:
- Token is incorrect - copy it again from Figma
- Token has expired - create a new one
- Token was revoked - create a new one

**"Insufficient permissions"**:
- Token doesn't have required access
- Create a new token with correct permissions
- Ensure token owner has access to files

**"Network error"**:
- Temporary connection issue
- Try again in a few minutes
- Check if Figma is experiencing issues

## Best Practices

### PAT Management

1. **Use descriptive account names**: Makes it easier to identify in Slack messages
2. **Set expiration dates**: Improves security, system will warn you before expiry
3. **Rotate regularly**: Update PATs quarterly for security
4. **One PAT per workspace**: Don't reuse PATs across different accounts
5. **Document your accounts**: Keep a note of which PAT belongs to which workspace

### Security

1. **Never share PATs**: Each user should have their own PATs
2. **Don't commit PATs**: Never put PATs in code or documents
3. **Revoke unused PATs**: Delete old PATs from Figma settings
4. **Monitor notifications**: Act on expiration warnings promptly
5. **Use strong passwords**: Protect your Figma account with 2FA

### Slack Organization

1. **Use dedicated channel**: Create a channel like `#figma-activity`
2. **Pin important messages**: Pin the daily recap for easy access
3. **Set up notifications**: Configure Slack notifications for the channel
4. **Use threads**: Reply in threads to keep channel organized
5. **Archive old messages**: Slack's search works on archived messages too

### Activity Monitoring

1. **Check daily recaps**: Review summaries to stay informed
2. **Search regularly**: Use Slack search to find specific activity
3. **Monitor your team**: See what others are working on
4. **Track projects**: Follow progress across multiple projects
5. **Use Glean**: Leverage Glean's AI search for better insights

### Multiple Accounts

1. **Consistent naming**: Use a naming convention (e.g., "client-name")
2. **Document accounts**: Keep a list of which account is which
3. **Separate PATs**: Each account needs its own PAT
4. **Monitor all accounts**: Check all accounts are active and working
5. **Update together**: When rotating PATs, update all accounts

## Getting Help

### Self-Service

1. Check this user guide
2. Review Slack messages for error notifications
3. Verify account configuration in `/config`
4. Test PAT in Figma settings

### Contact Admin

If issues persist:
1. Provide your email address
2. Describe the issue and when it started
3. Include any error messages
4. Mention which accounts are affected

### Common Questions

**Q: How often does the digest run?**
A: Check with your admin - typically hourly or daily.

**Q: Can I see activity from before I added my account?**
A: No, the system only collects activity going forward.

**Q: Can other users see my PATs?**
A: No, PATs are encrypted and only visible to you (masked).

**Q: What happens if my PAT expires?**
A: You'll get warnings 3 days before, then activity collection stops until you update it.

**Q: Can I add accounts from different Figma organizations?**
A: Yes, add multiple accounts with different PATs.

**Q: How do I stop tracking an account?**
A: Delete the account from the `/config` interface.

**Q: Are my PATs secure?**
A: Yes, they're encrypted at rest using AES-256-GCM encryption.

**Q: Can I use the same PAT for multiple accounts?**
A: No, each account should have its own unique PAT.

## Additional Resources

- [Figma Personal Access Tokens Documentation](https://www.figma.com/developers/api#access-tokens)
- [Slack Search Tips](https://slack.com/help/articles/202528808-Search-in-Slack)
- [Glean Search Guide](https://help.glean.com/) (if applicable)

## Feedback

Have suggestions for improving this guide or the system? Contact your admin or submit feedback through your organization's channels.

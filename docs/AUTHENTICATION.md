# Authentication Setup

This application uses NextAuth.js with magic link (email-based) authentication.

## Configuration

### Required Environment Variables

```bash
# NextAuth Configuration
NEXTAUTH_SECRET=your-nextauth-secret-here  # Generate with: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000         # Your app URL (change for production)

# Email Server Configuration (for magic links)
EMAIL_SERVER_HOST=smtp.example.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@example.com
EMAIL_SERVER_PASSWORD=your-email-password
EMAIL_FROM=noreply@example.com
```

### Optional: Email Whitelist

To restrict access to specific email addresses, set the `ALLOWED_EMAILS` environment variable:

```bash
ALLOWED_EMAILS=user1@example.com,user2@example.com,user3@example.com
```

If this variable is not set, any email address can sign in. If set, only the listed emails will be allowed.

## Email Provider Setup

You can use any SMTP server for sending magic link emails. Here are some common options:

### Gmail

```bash
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-gmail@gmail.com
EMAIL_SERVER_PASSWORD=your-app-password  # Use App Password, not regular password
EMAIL_FROM=your-gmail@gmail.com
```

Note: You need to enable 2FA and create an App Password in your Google Account settings.

### SendGrid

```bash
EMAIL_SERVER_HOST=smtp.sendgrid.net
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=apikey
EMAIL_SERVER_PASSWORD=your-sendgrid-api-key
EMAIL_FROM=verified-sender@yourdomain.com
```

### AWS SES

```bash
EMAIL_SERVER_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-ses-smtp-username
EMAIL_SERVER_PASSWORD=your-ses-smtp-password
EMAIL_FROM=verified-sender@yourdomain.com
```

## How It Works

1. User enters their email address on the sign-in page (`/auth/signin`)
2. System sends a magic link to the email address
3. User clicks the link in their email
4. System verifies the link and creates a session
5. User is redirected to the configuration page (`/config`)

## Session Storage

Sessions are stored in Vercel KV (Redis) with the following characteristics:

- **Duration**: 30 days
- **Cookie Options**:
  - `httpOnly`: true (prevents JavaScript access)
  - `secure`: true in production (HTTPS only)
  - `sameSite`: 'lax' (CSRF protection)

## Protected Routes

To protect a route, use the `requireAuth` helper:

```typescript
import { requireAuth } from '@/lib/auth';

export async function GET() {
  const user = await requireAuth(); // Throws error if not authenticated
  
  // Your protected logic here
  return Response.json({ userId: user.id });
}
```

To check authentication without throwing:

```typescript
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();
  
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Your protected logic here
  return Response.json({ userId: session.user.id });
}
```

## Client-Side Authentication

Use NextAuth's React hooks in client components:

```typescript
'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

export default function MyComponent() {
  const { data: session, status } = useSession();
  
  if (status === 'loading') {
    return <div>Loading...</div>;
  }
  
  if (!session) {
    return <button onClick={() => signIn()}>Sign In</button>;
  }
  
  return (
    <div>
      <p>Signed in as {session.user.email}</p>
      <button onClick={() => signOut()}>Sign Out</button>
    </div>
  );
}
```

## Testing

The authentication system includes unit tests for the email whitelist functionality:

```bash
npm test -- auth.test.ts
```

## Security Considerations

1. **NEXTAUTH_SECRET**: Must be a strong random string. Generate with `openssl rand -base64 32`
2. **Email Whitelist**: Use in production to restrict access to known users
3. **HTTPS**: Always use HTTPS in production (cookies are marked secure)
4. **Session Duration**: 30 days by default, adjust in `authOptions.session.maxAge`
5. **Email Provider**: Use a reliable SMTP service with proper authentication

## Troubleshooting

### Magic link not arriving

- Check email server credentials
- Verify EMAIL_FROM is a verified sender
- Check spam folder
- Review server logs for SMTP errors

### "Access Denied" error

- Check if ALLOWED_EMAILS is set
- Verify the email is in the whitelist
- Check for typos or extra whitespace

### Session not persisting

- Verify Vercel KV is properly configured
- Check KV_REST_API_URL and KV_REST_API_TOKEN
- Ensure cookies are enabled in browser

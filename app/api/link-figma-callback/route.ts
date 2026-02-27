import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@/lib/storage';

/**
 * GET /api/link-figma-callback
 * Handles OAuth callback for linking additional Figma accounts
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/config?error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/config?error=missing_parameters', request.url)
      );
    }

    // Decode state to get primary user email
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { primaryUserEmail } = stateData;

    if (!primaryUserEmail) {
      return NextResponse.redirect(
        new URL('/config?error=invalid_state', request.url)
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.figma.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.FIGMA_CLIENT_ID!,
        client_secret: process.env.FIGMA_CLIENT_SECRET!,
        code,
        redirect_uri: `${request.nextUrl.origin}/api/link-figma-callback`,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        new URL('/config?error=token_exchange_failed', request.url)
      );
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch('https://api.figma.com/v1/me', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.redirect(
        new URL('/config?error=user_info_failed', request.url)
      );
    }

    const figmaUser = await userResponse.json();

    // Store the linked account
    const storage = new Storage(process.env.ENCRYPTION_KEY!);
    const now = new Date().toISOString();

    await storage.saveUserAccount({
      userId: primaryUserEmail, // Link to primary user
      accountName: figmaUser.handle || figmaUser.email,
      encryptedPAT: storage.encryptPAT(tokens.access_token),
      teamIds: [], // Will be configured later
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.redirect(
      new URL('/config?success=account_linked', request.url)
    );
  } catch (error) {
    console.error('[Link Callback] Error:', error);
    return NextResponse.redirect(
      new URL('/config?error=unexpected_error', request.url)
    );
  }
}

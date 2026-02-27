import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

/**
 * GET /api/link-figma-account
 * Initiates OAuth flow to link an additional Figma account
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  // Build Figma OAuth URL with state parameter to indicate this is a linking flow
  const state = Buffer.from(JSON.stringify({
    action: 'link',
    primaryUserEmail: session.user.email,
  })).toString('base64');

  const params = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID!,
    redirect_uri: `${request.nextUrl.origin}/api/link-figma-callback`,
    scope: 'current_user:read file_content:read file_comments:read file_versions:read',
    state,
    response_type: 'code',
  });

  return NextResponse.redirect(`https://www.figma.com/oauth?${params.toString()}`);
}
